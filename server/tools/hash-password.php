<?php
/**
 * Create a password hash for config.local.php ('admin_password_hash').
 *
 *   php tools/hash-password.php
 *
 * The password is read from the terminal, never from the command line, so it does not
 * end up in your shell history. Only the HASH is printed; the password is not stored anywhere.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
fwrite(STDOUT, 'New admin password (min 12 characters): ');
if (stripos(PHP_OS, 'WIN') !== 0) {
    @system('stty -echo');
}
$pw = rtrim((string) fgets(STDIN), "\r\n");
if (stripos(PHP_OS, 'WIN') !== 0) {
    @system('stty echo');
}
fwrite(STDOUT, PHP_EOL);
if (strlen($pw) < 12) {
    fwrite(STDERR, "Password must be at least 12 characters.\n");
    exit(1);
}
$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
fwrite(STDOUT, "\nAdd this line to config.local.php:\n\n    'admin_password_hash' => '" . password_hash($pw, $algo) . "',\n\n");
