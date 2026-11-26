<?php
declare(strict_types=1);

namespace Portfolio;

/**
 * Single source of truth for what the admin may store.
 * Adding a field here makes it validated, stored and returned by the API.
 */
final class Schemas
{
    /** Must match SERVICE_ICONS in js/icons.js */
    public const ICONS = [
        'phone', 'tablet', 'apple', 'code', 'palette', 'shield', 'headset', 'gamepad',
        'layers', 'globe', 'cpu', 'chart', 'pen', 'rocket', 'database', 'server', 'bolt', 'wrench', 'cloud', 'lock',
    ];

    public const SOCIAL_KEYS = ['linkedin', 'github', 'instagram', 'facebook', 'youtube'];

    public static function settings(): array
    {
        return [
            // identity
            'name'         => ['type' => 'text', 'max' => 120, 'required' => true],
            'siteName'     => ['type' => 'text', 'max' => 80, 'required' => true],
            'siteTitle'    => ['type' => 'text', 'max' => 120],
            'designation'  => ['type' => 'text', 'max' => 120],
            'eyebrow'      => ['type' => 'text', 'max' => 160],
            'availability' => ['type' => 'text', 'max' => 80],
            // hero
            'heroHeading'  => ['type' => 'text', 'max' => 200],
            'heroIntro'    => ['type' => 'textarea', 'max' => 1200],
            'roles'        => ['type' => 'lines', 'max' => 60, 'maxItems' => 12],
            'heroImage'    => ['type' => 'media', 'max' => 300],
            'stats'        => ['type' => 'stats'],
            // about
            'aboutTitle'   => ['type' => 'text', 'max' => 200],
            'aboutBody'    => ['type' => 'textarea', 'max' => 6000],
            'aboutImage'   => ['type' => 'media', 'max' => 300],
            'interests'    => ['type' => 'lines', 'max' => 60, 'maxItems' => 16],
            // contact
            'email'        => ['type' => 'email', 'max' => 200],
            'phone'        => ['type' => 'phone', 'max' => 40],
            'location'     => ['type' => 'text', 'max' => 120],
            'notifyEmail'  => ['type' => 'email', 'max' => 200],
            'social'       => ['type' => 'social', 'keys' => self::SOCIAL_KEYS],
            'cvFile'       => ['type' => 'media', 'max' => 300],
            // appearance + SEO + footer
            'defaultTheme' => ['type' => 'enum', 'values' => ['system', 'light', 'dark'], 'default' => 'system'],
            'seoTitle'     => ['type' => 'text', 'max' => 120],
            'seoDescription' => ['type' => 'textarea', 'max' => 320],
            'seoKeywords'  => ['type' => 'text', 'max' => 300],
            'footerText'   => ['type' => 'text', 'max' => 200],
        ];
    }

    /** Settings keys that must never be sent to the public site. */
    public static function privateSettings(): array
    {
        return ['notifyEmail'];
    }

    /**
     * @return array<string,array{prefix:string,max:int,schema:array,unique?:string,label:string}>
     */
    public static function collections(): array
    {
        return [
            'projects' => [
                'prefix' => 'prj', 'max' => 200, 'label' => 'project',
                'schema' => [
                    'title'       => ['type' => 'text', 'max' => 120, 'required' => true],
                    'description' => ['type' => 'textarea', 'max' => 1500],
                    'tags'        => ['type' => 'tags', 'max' => 24, 'maxItems' => 8],
                    'liveUrl'     => ['type' => 'url', 'max' => 300],
                    'githubUrl'   => ['type' => 'url', 'max' => 300],
                    'image'       => ['type' => 'media', 'max' => 300],
                    'featured'    => ['type' => 'bool', 'default' => false],
                    'published'   => ['type' => 'bool', 'default' => true],
                ],
            ],
            'skills' => [
                'prefix' => 'skl', 'max' => 100, 'label' => 'skill',
                'schema' => [
                    'name'     => ['type' => 'text', 'max' => 60, 'required' => true],
                    'level'    => ['type' => 'int', 'min' => 0, 'maxValue' => 100, 'default' => 50],
                    'category' => ['type' => 'text', 'max' => 60],
                ],
            ],
            'services' => [
                'prefix' => 'svc', 'max' => 50, 'label' => 'service', 'unique' => 'slug',
                'schema' => [
                    'title'     => ['type' => 'text', 'max' => 120, 'required' => true],
                    'slug'      => ['type' => 'slug', 'max' => 60],
                    'icon'      => ['type' => 'enum', 'values' => self::ICONS, 'default' => 'layers'],
                    'summary'   => ['type' => 'textarea', 'max' => 400],
                    'sections'  => ['type' => 'sections', 'maxItems' => 20],
                    'published' => ['type' => 'bool', 'default' => true],
                ],
            ],
            'experience' => [
                'prefix' => 'exp', 'max' => 50, 'label' => 'experience entry',
                'schema' => [
                    'role'   => ['type' => 'text', 'max' => 120, 'required' => true],
                    'org'    => ['type' => 'text', 'max' => 160],
                    'period' => ['type' => 'text', 'max' => 60],
                    'text'   => ['type' => 'textarea', 'max' => 1200],
                ],
            ],
            'education' => [
                'prefix' => 'edu', 'max' => 30, 'label' => 'education entry',
                'schema' => [
                    'title'  => ['type' => 'text', 'max' => 160, 'required' => true],
                    'org'    => ['type' => 'text', 'max' => 200],
                    'period' => ['type' => 'text', 'max' => 60],
                ],
            ],
            'achievements' => [
                'prefix' => 'ach', 'max' => 50, 'label' => 'achievement',
                'schema' => [
                    'title'       => ['type' => 'text', 'max' => 160, 'required' => true],
                    'description' => ['type' => 'textarea', 'max' => 600],
                    'year'        => ['type' => 'text', 'max' => 20],
                ],
            ],
            'testimonials' => [
                'prefix' => 'tst', 'max' => 50, 'label' => 'testimonial',
                'schema' => [
                    'name'      => ['type' => 'text', 'max' => 120, 'required' => true],
                    'role'      => ['type' => 'text', 'max' => 160],
                    'quote'     => ['type' => 'textarea', 'max' => 800, 'required' => true],
                    'avatar'    => ['type' => 'media', 'max' => 300],
                    'published' => ['type' => 'bool', 'default' => true],
                ],
            ],
            'gallery' => [
                'prefix' => 'gal', 'max' => 300, 'label' => 'photo',
                'schema' => [
                    'file'    => ['type' => 'media', 'max' => 300, 'required' => true],
                    'caption' => ['type' => 'text', 'max' => 160],
                ],
            ],
        ];
    }

    /** Defaults used if settings.json is missing or lacks a key. */
    public static function settingsDefaults(): array
    {
        $d = [];
        foreach (self::settings() as $k => $spec) {
            switch ($spec['type']) {
                case 'lines':
                case 'stats':
                    $d[$k] = [];
                    break;
                case 'social':
                    $d[$k] = array_fill_keys(self::SOCIAL_KEYS, '');
                    break;
                default:
                    $d[$k] = $spec['default'] ?? '';
            }
        }
        return $d;
    }
}
