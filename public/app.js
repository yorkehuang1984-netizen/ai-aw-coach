/* ============================================================
   AW-AI Coach — 前端交互逻辑
   ============================================================ */

// --- 状态 ---
const state = {
  sessionId: getOrCreateSessionId(),
  currentView: 'chat',
  weeklyReport: '', // 缓存周报内容
  chartInstance: null, // Chart.js 实例
};

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupChat();
  setupWeekly();
  setupChart();
});

// ============================================================
// Session ID（存 localStorage，跨页面刷新保持）
// ============================================================
function getOrCreateSessionId() {
  let sid = localStorage.getItem('aw-coach-session');
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('aw-coach-session', sid);
  }
  return sid;
}

// ============================================================
// 导航切换
// ============================================================
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = {
    chat: document.getElementById('view-chat'),
    weekly: document.getElementById('view-weekly'),
    chart: document.getElementById('view-chart'),
  };

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;

      // 更新按钮状态
      navBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // 切换视图
      Object.values(views).forEach((v) => v.classList.remove('active'));
      views[view].classList.add('active');

      state.currentView = view;

      // 切换到图表视图时自动加载
      if (view === 'chart') {
        loadChart('today');
      }
    });
  });
}

// ============================================================
// 聊天功能
// ============================================================
function setupChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');
  const messagesContainer = document.getElementById('chat-messages');

  // 发送按钮
  sendBtn.addEventListener('click', () => sendMessage());

  // 回车发送
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 快捷问题按钮
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.question;
      sendMessage();
    });
  });

  // 检查是否输入了 /weekly 命令
  input.addEventListener('input', () => {
    if (input.value.trim() === '/weekly') {
      input.value = '';
      document.getElementById('btn-weekly').click();
      document.getElementById('btn-generate-weekly').click();
    }
  });

  async function sendMessage() {
    const message = input.value.trim();
    if (!message) return;

    // 禁用输入
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    // 隐藏欢迎消息
    const welcome = messagesContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // 显示用户消息
    appendMessage('user', message);

    // 显示思考中
    const thinkingId = appendThinking();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          sessionId: state.sessionId,
        }),
      });

      const data = await response.json();

      // 移除思考中
      removeThinking(thinkingId);

      if (data.success) {
        appendMessage('assistant', data.reply);
      } else {
        const errMsg = data.error.includes('ActivityWatch')
          ? '⚠️ 无法获取 ActivityWatch 数据，请确认 AW 正在运行（检查系统托盘图标）'
          : data.error.includes('DeepSeek')
            ? '⚠️ AI 服务暂时不可用：' + data.error
            : '⚠️ ' + data.error;
        appendMessage('assistant', errMsg);
      }
    } catch (error) {
      removeThinking(thinkingId);
      appendMessage('assistant', '⚠️ 无法连接到服务器。请在终端运行 node server.js 启动服务。');
    }

    // 恢复输入
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// 添加消息气泡
function appendMessage(role, content) {
  const container = document.getElementById('chat-messages');

  const div = document.createElement('div');
  div.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🧠';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // 简单处理 Markdown（粗体、列表等基础语法）
  contentDiv.innerHTML = formatMessage(content);

  div.appendChild(avatar);
  div.appendChild(contentDiv);
  container.appendChild(div);

  // 滚动到底部
  container.scrollTop = container.scrollHeight;
}

// 思考中动画
function appendThinking() {
  const container = document.getElementById('chat-messages');
  const id = 'thinking-' + Date.now();

  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '🧠';

  const bubble = document.createElement('div');
  bubble.className = 'message-content thinking-bubble';
  bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';

  div.appendChild(avatar);
  div.appendChild(bubble);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  return id;
}

function removeThinking(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// 简单的文本格式化（在没有 marked 的情况下也够用）
function formatMessage(text) {
  // 转义 HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 换行
  html = html.replace(/\n/g, '<br>');

  return html;
}

// ============================================================
// 周报功能
// ============================================================
function setupWeekly() {
  const generateBtn = document.getElementById('btn-generate-weekly');
  const reportContent = document.getElementById('report-content');
  const reportActions = document.getElementById('report-actions');
  const loadingEl = document.getElementById('weekly-loading');
  const copyBtn = document.getElementById('btn-copy');
  const downloadBtn = document.getElementById('btn-download');

  generateBtn.addEventListener('click', async () => {
    // 显示加载
    generateBtn.style.display = 'none';
    reportContent.style.display = 'none';
    reportActions.style.display = 'none';
    loadingEl.style.display = 'block';

    try {
      const response = await fetch('/api/weekly', { method: 'POST' });
      const data = await response.json();

      loadingEl.style.display = 'none';

      if (data.success) {
        state.weeklyReport = data.report;
        // 使用 marked.js 渲染 Markdown
        // html: false 防止 LLM 输出中的恶意脚本被渲染
        reportContent.innerHTML = marked.parse(data.report, { html: false, breaks: true });
        reportContent.style.display = 'block';
        reportActions.style.display = 'flex';
      } else {
        reportContent.innerHTML = `<p style="color:var(--error)">❌ ${data.error}</p>`;
        reportContent.style.display = 'block';
        generateBtn.style.display = 'block';
      }
    } catch (error) {
      loadingEl.style.display = 'none';
      reportContent.innerHTML = '<p style="color:var(--error)">⚠️ 网络错误，请确认服务器正在运行（终端执行 node server.js）</p>';
      reportContent.style.display = 'block';
      generateBtn.style.display = 'block';
    }
  });

  // 复制
  copyBtn.addEventListener('click', () => {
    if (!state.weeklyReport) return;
    navigator.clipboard.writeText(state.weeklyReport).then(() => {
      showToast('✅ 已复制到剪贴板');
    });
  });

  // 下载
  downloadBtn.addEventListener('click', () => {
    if (!state.weeklyReport) return;
    const blob = new Blob([state.weeklyReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-report-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ 已下载');
  });
}

// ============================================================
// 时间分布图表
// ============================================================
function setupChart() {
  // 时间段切换
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadChart(btn.dataset.period);
    });
  });
}

async function loadChart(period) {
  const commentEl = document.getElementById('chart-comment');
  commentEl.innerHTML = '<p>加载中……</p>';

  try {
    const response = await fetch('/api/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period }),
    });

    const data = await response.json();

    if (!data.success) {
      commentEl.innerHTML = `<p style="color:var(--error)">❌ ${data.error}</p>`;
      return;
    }

    renderChart(data.chartData);
    commentEl.innerHTML = `<p>${data.aiComment || '暂无解读'}</p>`;
  } catch (error) {
    commentEl.innerHTML = '<p style="color:var(--error)">⚠️ 加载失败，请确认服务器正在运行（终端执行 node server.js）</p>';
  }
}

function renderChart(chartData) {
  // 销毁旧图表
  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  const ctx = document.getElementById('timeChart').getContext('2d');
  const labels = chartData.map((d) => d.app);
  const values = chartData.map((d) => d.duration_minutes);
  const colors = [
    '#4f46e5', '#0891b2', '#059669', '#d97706',
    '#dc2626', '#7c3aed', '#be123c', '#ca8a04',
  ];

  state.chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#1a1a1a',
            padding: 12,
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = Math.round((ctx.parsed / total) * 100);
              return ` ${ctx.label}: ${ctx.parsed} 分钟 (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ============================================================
// Toast 提示
// ============================================================
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}
