/** Overview: counts, configuration health and the latest inquiries. */
(function () {
  'use strict';
  const { h, icon, btn } = { h: UI.h, icon: UI.icon, btn: UI.btn };
  const API = window.AdminAPI;

  const stat = (label, value, o) => {
    o = o || {};
    const tag = o.href ? 'a' : 'div';
    return h(tag, { class: 'stat' + (o.accent ? ' stat-accent' : ''), href: o.href || null },
      h('span', { class: 'stat-label', text: label }),
      h('strong', { class: 'stat-num', text: String(value) }),
      o.sub ? h('span', { class: 'stat-sub', text: o.sub }) : null);
  };

  const STATUS = {
    ready: { text: 'Ready', cls: 'pill-ok', msg: 'Everything needed for a healthy site is in place.' },
    review: { text: 'Needs review', cls: 'pill-warn', msg: 'The site works, but a few recommendations are open.' },
    attention: { text: 'Needs attention', cls: 'pill-bad', msg: 'Something required is missing or broken. Fix the red items first.' },
  };

  Admin.register('overview', {
    title: 'Overview',
    icon: 'dash',
    async render(root, ctx) {
      const [d, latest] = await Promise.all([API.get('dashboard.php'), API.get('inquiries.php?per_page=5')]);
      Admin.setUnread(d.inquiries.new);

      ctx.actions(
        btn('Add project', { kind: 'primary', icon: 'plus', onClick: () => { Admin.go('projects'); sessionStorage.setItem('rp_admin_open_new', 'projects'); } }),
        btn('Refresh', { kind: 'ghost', icon: 'refresh', onClick: () => Admin.route() }));

      const st = STATUS[d.config.status] || STATUS.review;
      const checks = d.config.checks.map((c) => h('li', { class: 'check check-' + c.level },
        h('span', { class: 'check-ic', 'aria-hidden': 'true' }, icon(c.ok ? 'check' : 'alert', 16)),
        h('div', null,
          h('strong', { text: c.label }),
          h('span', { class: 'sr-only', text: c.ok ? ' (OK)' : c.level === 'bad' ? ' (problem)' : ' (recommendation)' }),
          c.ok ? null : h('p', { class: 'muted', text: c.detail }))));

      const counts = d.counts;
      const content = [
        ['skills', 'Skills', counts.skills], ['services', 'Services', counts.services], ['experience', 'Experience', counts.experience],
        ['education', 'Education', counts.education], ['achievements', 'Achievements', counts.achievements],
        ['testimonials', 'Testimonials', counts.testimonials], ['gallery', 'Gallery photos', counts.gallery],
      ];

      const recent = latest.items.length
        ? h('ul', { class: 'recent' }, latest.items.map((i) => h('li', null,
          h('a', { href: '#/inquiries', class: 'recent-row', onClick: () => sessionStorage.setItem('rp_admin_open_inquiry', i.id) },
            h('span', { class: 'dot' + (i.read ? '' : ' dot-new'), 'aria-hidden': 'true' }),
            h('span', { class: 'recent-main' }, h('strong', { text: i.name }), h('span', { class: 'muted', text: i.subject || i.message.slice(0, 70) })),
            h('span', { class: 'muted small', text: UI.ago(i.createdAt) }),
            i.read ? null : h('span', { class: 'sr-only', text: 'New' })))))
        : UI.empty('No inquiries yet. Messages sent from your contact form will appear here.');

      root.append(
        h('section', { 'aria-label': 'Key numbers', class: 'stats' },
          stat('Total inquiries', d.inquiries.total, { href: '#/inquiries' }),
          stat('New inquiries', d.inquiries.new, { href: '#/inquiries', accent: d.inquiries.new > 0, sub: d.inquiries.new ? 'Waiting for a reply' : 'All caught up' }),
          stat('Read inquiries', d.inquiries.read),
          stat('Total projects', d.projects.total, { href: '#/projects' }),
          stat('Published projects', d.projects.published, { sub: d.projects.total - d.projects.published ? (d.projects.total - d.projects.published) + ' hidden draft(s)' : 'All visible' }),
          stat('Featured projects', d.projects.featured, { sub: 'Shown on the home page' })),

        h('div', { class: 'cols' },
          h('section', { class: 'card' },
            h('div', { class: 'card-head' },
              h('h2', { text: 'Website configuration' }),
              h('span', { class: 'pill ' + st.cls, text: st.text })),
            h('p', { class: 'muted', text: st.msg + ' PHP ' + d.php + '.' }),
            h('ul', { class: 'checks' }, checks)),

          h('div', { class: 'stack' },
            h('section', { class: 'card' },
              h('div', { class: 'card-head' }, h('h2', { text: 'Latest inquiries' }), h('a', { class: 'link', href: '#/inquiries', text: 'View all' })),
              recent),
            h('section', { class: 'card' },
              h('div', { class: 'card-head' }, h('h2', { text: 'Content' })),
              h('ul', { class: 'content-counts' }, content.map(([id, label, n]) =>
                h('li', null, h('a', { href: '#/' + id }, h('span', { text: label }), h('strong', { text: String(n) })))))))));
    },
  });
})();
