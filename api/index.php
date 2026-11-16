<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
$RP_ALLOWED_ORIGIN = '';
if (is_file(__DIR__.'/config.php')) require __DIR__.'/config.php';
$allowedOrigin = getenv('RP_ALLOWED_ORIGIN') ?: ($RP_ALLOWED_ORIGIN ?: '');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($allowedOrigin && hash_equals($allowedOrigin, $origin)) {
  header('Access-Control-Allow-Origin: '.$allowedOrigin);
  header('Access-Control-Allow-Credentials: true');
  header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
session_name('rp_portfolio_admin');
$isHttps=!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off';
session_set_cookie_params(['httponly'=>true,'secure'=>$isHttps,'samesite'=>$isHttps?'None':'Lax','path'=>'/']);
session_start();
$store = __DIR__.'/storage';
$contentFile = $store.'/content.json';
$inquiriesFile = $store.'/inquiries.json';
$adminFile = $store.'/admin.json';
function out(array $data, int $status=200): never { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); exit; }
function readJson(string $path, array $fallback=[]): array { if (!is_file($path)) return $fallback; $v=json_decode((string)file_get_contents($path),true); return is_array($v)?$v:$fallback; }
function writeJson(string $path, array $value): void {
  $fp=fopen($path,'c+'); if(!$fp) out(['success'=>false,'message'=>'Storage unavailable'],500);
  if(!flock($fp,LOCK_EX)){fclose($fp);out(['success'=>false,'message'=>'Storage busy'],503);}
  ftruncate($fp,0); rewind($fp); fwrite($fp,json_encode($value,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)); fflush($fp); flock($fp,LOCK_UN); fclose($fp);
}
function body(): array { $v=json_decode((string)file_get_contents('php://input'),true); return is_array($v)?$v:[]; }
function requireAdmin(): void {
  if (empty($_SESSION['admin'])) out(['success'=>false,'message'=>'Authentication required'],401);
  $token=$_SERVER['HTTP_X_CSRF_TOKEN']??'';
  if (!isset($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'],$token)) out(['success'=>false,'message'=>'Invalid security token'],403);
}
$action=$_GET['action']??(body()['action']??'');
if ($action==='status' && $_SERVER['REQUEST_METHOD']==='GET') {
  out(['success'=>true,'configured'=>is_file($adminFile),'authenticated'=>!empty($_SESSION['admin'])]);
}

if ($action==='content' && $_SERVER['REQUEST_METHOD']==='GET') {
  $content=readJson($contentFile, readJson(dirname(__DIR__).'/content.json',[]));
  out(['success'=>true,'content'=>$content]);
}
if ($action==='setup' && $_SERVER['REQUEST_METHOD']==='POST') {
  if (is_file($adminFile)) out(['success'=>false,'message'=>'Admin is already configured'],409);
  $b=body(); $password=(string)($b['password']??'');
  if(strlen($password)<12) out(['success'=>false,'message'=>'Use a password with at least 12 characters'],422);
  writeJson($adminFile,['password_hash'=>password_hash($password,PASSWORD_DEFAULT),'created_at'=>gmdate('c')]);
  session_regenerate_id(true); $_SESSION['admin']=true; $_SESSION['csrf']=bin2hex(random_bytes(32));
  out(['success'=>true,'csrf'=>$_SESSION['csrf']]);
}
if ($action==='login' && $_SERVER['REQUEST_METHOD']==='POST') {
  $b=body(); $admin=readJson($adminFile);
  if(!$admin || !password_verify((string)($b['password']??''),(string)($admin['password_hash']??''))) out(['success'=>false,'message'=>'Incorrect password'],401);
  session_regenerate_id(true); $_SESSION['admin']=true; $_SESSION['csrf']=bin2hex(random_bytes(32));
  out(['success'=>true,'csrf'=>$_SESSION['csrf']]);
}
if ($action==='logout' && $_SERVER['REQUEST_METHOD']==='POST') { requireAdmin(); $_SESSION=[]; session_destroy(); out(['success'=>true]); }
if ($action==='inquiry' && $_SERVER['REQUEST_METHOD']==='POST') {
  $b=body();
  if(!empty($b['website'])) out(['success'=>true]);
  $name=trim((string)($b['name']??'')); $email=trim((string)($b['email']??'')); $message=trim((string)($b['message']??''));
  if($name==='' || strlen($name)>120 || !filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($message)<5 || strlen($message)>5000) out(['success'=>false,'message'=>'Please check your details and try again'],422);
  $last=(int)($_SESSION['last_inquiry']??0); if(time()-$last<15) out(['success'=>false,'message'=>'Please wait before sending another message'],429);
  $items=readJson($inquiriesFile,[]);
  array_unshift($items,['id'=>bin2hex(random_bytes(8)),'name'=>$name,'email'=>$email,'phone'=>substr(trim((string)($b['phone']??'')),0,40),'subject'=>substr(trim((string)($b['subject']??'')),0,160),'message'=>$message,'created_at'=>gmdate('c'),'read'=>false]);
  writeJson($inquiriesFile,array_slice($items,0,1000)); $_SESSION['last_inquiry']=time();
  out(['success'=>true]);
}
if ($action==='admin-data' && $_SERVER['REQUEST_METHOD']==='GET') {
  if(empty($_SESSION['admin'])) out(['success'=>false,'message'=>'Authentication required'],401);
  $_SESSION['csrf']=$_SESSION['csrf']??bin2hex(random_bytes(32));
  out(['success'=>true,'csrf'=>$_SESSION['csrf'],'content'=>readJson($contentFile,readJson(dirname(__DIR__).'/content.json',[])),'inquiries'=>readJson($inquiriesFile,[])]);
}
if ($action==='save-content' && $_SERVER['REQUEST_METHOD']==='POST') {
  requireAdmin(); $b=body(); $content=$b['content']??null;
  if(!is_array($content) || !isset($content['settings']) || !isset($content['services']) || !isset($content['projects'])) out(['success'=>false,'message'=>'Invalid portfolio content'],422);
  writeJson($contentFile,$content); out(['success'=>true]);
}
if ($action==='update-inquiry' && $_SERVER['REQUEST_METHOD']==='POST') {
  requireAdmin(); $b=body(); $items=readJson($inquiriesFile,[]); $id=(string)($b['id']??'');
  foreach($items as &$item) if(($item['id']??'')===$id) $item['read']=!empty($b['read']);
  unset($item); writeJson($inquiriesFile,$items); out(['success'=>true]);
}
if ($action==='delete-inquiry' && $_SERVER['REQUEST_METHOD']==='POST') {
  requireAdmin(); $id=(string)(body()['id']??''); $items=array_values(array_filter(readJson($inquiriesFile,[]),fn($x)=>($x['id']??'')!==$id)); writeJson($inquiriesFile,$items); out(['success'=>true]);
}
if ($action==='change-password' && $_SERVER['REQUEST_METHOD']==='POST') {
  requireAdmin(); $b=body(); $old=(string)($b['old_password']??''); $new=(string)($b['new_password']??''); $admin=readJson($adminFile);
  if(!password_verify($old,(string)($admin['password_hash']??''))) out(['success'=>false,'message'=>'Current password is incorrect'],401);
  if(strlen($new)<12) out(['success'=>false,'message'=>'New password must be at least 12 characters'],422);
  $admin['password_hash']=password_hash($new,PASSWORD_DEFAULT); writeJson($adminFile,$admin); out(['success'=>true]);
}
out(['success'=>false,'message'=>'Unknown action'],404);
