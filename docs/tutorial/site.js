(function () {
  function selectNode(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function flash(btn, text) {
    btn.textContent = text;
    btn.setAttribute('data-done', '1');
    window.setTimeout(function () {
      btn.textContent = '复制';
      btn.removeAttribute('data-done');
    }, 1600);
  }

  document.querySelectorAll('.code').forEach(function (block) {
    var pre = block.querySelector('pre');
    if (!pre) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy';
    btn.textContent = '复制';
    btn.setAttribute('aria-label', '复制这段命令');

    btn.addEventListener('click', function () {
      var text = pre.innerText;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          flash(btn, '已复制');
        }).catch(function () {
          selectNode(pre);
          flash(btn, '已选中');
        });
      } else {
        selectNode(pre);
        flash(btn, '已选中');
      }
    });

    block.appendChild(btn);
  });
})();
