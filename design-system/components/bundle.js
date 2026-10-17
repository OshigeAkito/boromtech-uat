/* @ds-bundle: {"format":4,"namespace":"BoromTech","components":[{"name":"TaskCard"},{"name":"StatusPill"},{"name":"Button"},{"name":"StarRating"},{"name":"TierBadge"}]} */
(function () {
  var React = window.React, h = React.createElement;
  var cx = function () { return Array.prototype.filter.call(arguments, Boolean).join(' '); };

  var STATUS = {
    open: { label: 'Open', tone: 'brand' },
    assigned: { label: 'In progress', tone: 'neutral' },
    changes: { label: 'Changes requested', tone: 'danger' },
    submitted: { label: 'Awaiting review', tone: 'warning' },
    approved: { label: 'Approved, unpaid', tone: 'success-ring' },
    paid: { label: 'Paid', tone: 'success' }
  };

  var TIERS = {
    Gold: { bars: 3 },
    Silver: { bars: 2 },
    Bronze: { bars: 1 },
    Rookie: { bars: 0 },
    Unranked: { bars: 0, muted: true }
  };

  function Button(props) {
    var variant = props.variant || 'secondary', size = props.size || 'md';
    var rest = Object.assign({}, props);
    delete rest.variant; delete rest.size; delete rest.className;
    return h('button', Object.assign({ type: 'button' }, rest, {
      className: cx('bt-btn', 'bt-btn-' + variant, 'bt-btn-' + size, props.className)
    }));
  }

  function StatusPill(props) {
    var s = STATUS[props.status] || STATUS.open;
    return h('span', { className: cx('bt-pill', 'bt-tone-' + s.tone) },
      h('span', { className: 'bt-pill-dot', 'aria-hidden': true }),
      props.children || s.label);
  }

  function StarRating(props) {
    var value = props.value || 0, max = props.max || 5, onChange = props.onChange;
    var stars = [];
    for (var i = 1; i <= max; i++) {
      var on = i <= value;
      stars.push(onChange
        ? h('button', { key: i, type: 'button', className: cx('bt-star', on && 'bt-star-on'), 'aria-label': i + ' of ' + max, 'aria-pressed': i === value, onClick: onChange.bind(null, i) }, '★')
        : h('span', { key: i, className: cx('bt-star', on && 'bt-star-on'), 'aria-hidden': true }, '★'));
    }
    return h('span', { className: cx('bt-stars', props.size === 'sm' && 'bt-stars-sm'), role: onChange ? 'group' : 'img', 'aria-label': onChange ? 'Grade' : 'Grade ' + value + ' of ' + max }, stars);
  }

  function TierBadge(props) {
    var tier = TIERS[props.tier] ? props.tier : 'Unranked', t = TIERS[tier];
    var bars = [0, 1, 2].map(function (i) { return h('span', { key: i, className: cx('bt-tier-bar', i < t.bars && 'bt-tier-bar-on') }); });
    return h('span', { className: cx('bt-tier', t.muted && 'bt-tier-muted'), title: tier + (props.score != null ? ', score ' + props.score : '') },
      h('span', { className: 'bt-tier-bars', 'aria-hidden': true }, bars),
      h('span', { className: 'bt-tier-name' }, tier),
      props.score != null && h('span', { className: 'bt-tier-score' }, props.score));
  }

  var DAY = 86400000;
  function dueText(due, now) {
    var d = new Date(due + 'T00:00:00'), today = new Date(now); today.setHours(0, 0, 0, 0);
    var days = Math.round((d - today) / DAY);
    var date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    if (days < 0) return { text: 'Due ' + date + ' · ' + -days + (days === -1 ? ' day' : ' days') + ' overdue', late: true };
    if (days === 0) return { text: 'Due today', soon: true };
    return { text: 'Due ' + date + ' · ' + days + (days === 1 ? ' day' : ' days') + ' left', soon: days <= 2 };
  }

  function initials(name) {
    return name.split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
  }

  function TaskCard(props) {
    var status = props.status || 'open', currency = props.currency || '฿';
    var due = props.due ? dueText(props.due, props.now || Date.now()) : null;
    var live = status === 'open' || status === 'assigned' || status === 'changes';
    var late = due && due.late && live;
    return h('article', { className: cx('bt-task', props.compact && 'bt-task-compact') },
      h('header', { className: 'bt-task-head' },
        h(StatusPill, { status: status }),
        h('span', { className: 'bt-task-payout' }, currency + Number(props.payout || 0).toLocaleString('en-US'))),
      h('div', { className: 'bt-task-titles' },
        h('h3', { className: 'bt-task-title' }, props.title),
        props.project && h('p', { className: 'bt-task-project' }, props.project)),
      props.description && h('p', { className: 'bt-task-desc' }, props.description),
      (due || props.assignee) && h('div', { className: 'bt-task-meta' },
        due && h('span', { className: cx('bt-task-due', late && 'bt-late', live && due.soon && 'bt-soon') }, due.text),
        props.assignee && h('span', { className: 'bt-task-who' },
          h('span', { className: 'bt-avatar', 'aria-hidden': true }, initials(props.assignee)), props.assignee)),
      props.submission && h('a', { className: 'bt-task-link', href: props.submission, target: '_blank', rel: 'noreferrer' }, props.submission.replace(/^https?:\/\//, '')),
      props.review && h('div', { className: cx('bt-task-review', !props.review.grade && 'bt-task-review-changes') },
        props.review.grade ? h(StarRating, { value: props.review.grade, size: 'sm' }) : h('strong', null, 'Changes requested'),
        props.review.feedback && h('span', null, props.review.feedback)),
      props.children && h('footer', { className: 'bt-task-actions' }, props.children));
  }

  window.BoromTech = Object.assign(window.BoromTech || {}, {
    TaskCard: TaskCard, StatusPill: StatusPill, Button: Button, StarRating: StarRating, TierBadge: TierBadge, STATUS: STATUS
  });
})();
