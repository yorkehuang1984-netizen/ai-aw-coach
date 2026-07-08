// 加载环境变量（必须放在最顶部）
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const aw = require('./services/activitywatch');
const { askDeepSeek, generateWeeklyReport } = require('./services/deepseek');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 多轮对话历史（内存存储，每个 sessionId 保留最近 6 条）
const conversations = new Map();

// ============================================================
// 工具：解析用户消息中的时间范围
// ============================================================

function parseTimeRange(message) {
  const msg = message.toLowerCase();
  const now = new Date();

  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const monday = (d) => {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const m = new Date(d);
    m.setDate(d.getDate() + diff);
    return dayStart(m);
  };

  const today = dayStart(now);
  const yesterday = new Date(today.getTime() - 86400000);
  const dayBeforeYesterday = new Date(today.getTime() - 2 * 86400000);
  const thisMonday = monday(now);
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000);
  const lastSunday = new Date(thisMonday.getTime() - 86400000);

  // 多时间段对比
  if (/(本周|这周).*(上周|上一周).*(对比|比较|相比|变化)/.test(msg) ||
      /(上周|上一周).*(本周|这周).*(对比|比较|相比|变化)/.test(msg) ||
      /对比.*(本周|这周).*(上周|上一周)/.test(msg)) {
    return [
      { start: thisMonday, end: now, label: '本周' },
      { start: lastMonday, end: lastSunday, label: '上周' },
    ];
  }

  if (/(今天|昨天).*(对比|比较|相比|变化)/.test(msg) ||
      /(昨天|今天).*(昨天|今天).*(对比|比较|相比|变化)/.test(msg)) {
    return [
      { start: today, end: now, label: '今天' },
      { start: yesterday, end: today, label: '昨天' },
    ];
  }

  // 单时间段
  if (/今天|今日/i.test(msg)) return [{ start: today, end: now, label: '今天' }];
  if (/昨天|昨日/i.test(msg)) return [{ start: yesterday, end: today, label: '昨天' }];
  if (/前天/i.test(msg)) return [{ start: dayBeforeYesterday, end: yesterday, label: '前天' }];
  if (/本周|这周|这星期/i.test(msg)) return [{ start: thisMonday, end: now, label: '本周' }];
  if (/上周|上一周|上星期/i.test(msg)) return [{ start: lastMonday, end: lastSunday, label: '上周' }];
  if (/周一|星期一/i.test(msg)) {
    const d = new Date(thisMonday);
    return [{ start: dayStart(d), end: new Date(d.getTime() + 86400000), label: '周一' }];
  }
  if (/周二|星期二/i.test(msg)) {
    const d = new Date(thisMonday.getTime() + 86400000);
    return [{ start: dayStart(d), end: new Date(d.getTime() + 86400000), label: '周二' }];
  }
  if (/周三|星期三/i.test(msg)) {
    const d = new Date(thisMonday.getTime() + 2 * 86400000);
    return [{ start: dayStart(d), end: new Date(d.getTime() + 86400000), label: '周三' }];
  }
  if (/周四|星期四/i.test(msg)) {
    const d = new Date(thisMonday.getTime() + 3 * 86400000);
    return [{ start: dayStart(d), end: new Date(d.getTime() + 86400000), label: '周四' }];
  }
  if (/周五|星期五/i.test(msg)) {
    const d = new Date(thisMonday.getTime() + 4 * 86400000);
    return [{ start: dayStart(d), end: new Date(d.getTime() + 86400000), label: '周五' }];
  }
  if (/周六|星期六/i.test(msg)) {
    const d = new Date(thisMonday.getTime() + 5 * 86400000);
    return [{ start: dayStart(d), end: new Date(d.getTime() + 86400000), label: '周六' }];
  }
  if (/周日|星期天|星期日/i.test(msg)) {
    const d = new Date(thisMonday.getTime() + 6 * 86400000);
    return [{ start: dayStart(d), end: new Date(d.getTime() + 86400000), label: '周日' }];
  }
  if (/这月|本月/i.test(msg)) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return [{ start: monthStart, end: now, label: '本月' }];
  }

  // 默认今天
  return [{ start: today, end: now, label: '今天' }];
}

// ============================================================
// API 路由
// ============================================================

// POST /api/chat — 智能对话
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim()) {
      return res.json({ success: false, error: '消息不能为空' });
    }

    const sid = sessionId || 'default';
    if (!conversations.has(sid)) {
      conversations.set(sid, []);
    }
    const history = conversations.get(sid);

    // 解析时间范围 + 拉取数据
    const timeRanges = parseTimeRange(message);
    console.log(`💬 [${sid.slice(0, 8)}]: "${message}" → ${timeRanges.map(r => r.label).join(', ')}`);

    const dataPackages = await Promise.all(
      timeRanges.map(async (range) => {
        const [appSummary, topTitles] = await Promise.all([
          aw.getAppUsageSummary(range.start, range.end),
          aw.getTopTitles(range.start, range.end),
        ]);
        return { label: range.label, appSummary, topTitles };
      })
    );

    const reply = await askDeepSeek(message, dataPackages, history);
    console.log(`🤖 回复（${reply.length} 字）`);

    // 更新对话历史
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    if (history.length > 6) history.splice(0, history.length - 6);

    res.json({ success: true, reply });
  } catch (error) {
    console.error('聊天错误:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/weekly — 反思周报
app.post('/api/weekly', async (req, res) => {
  try {
    let weeklyPrompt;
    try {
      weeklyPrompt = fs.readFileSync(
        path.join(__dirname, 'prompts', 'weekly.md'), 'utf-8'
      );
    } catch (e) {
      console.error('读取周报模板失败:', e.message);
      return res.status(500).json({ success: false, error: '周报模板文件丢失，请检查 prompts/weekly.md' });
    }

    const weeklyData = await aw.getWeeklySummary(7);

    // 上周对比数据
    const now = new Date();
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const lastWeekStart = new Date(thisMonday.getTime() - 7 * 86400000);
    const lastWeekEnd = new Date(thisMonday.getTime() - 1000);
    const lastWeekSummary = await aw.getAppUsageSummary(lastWeekStart, lastWeekEnd);
    const lastWeekDailyTotals = await aw.getDailyTotals(lastWeekStart, lastWeekEnd);
    const lastWeekTotal = lastWeekDailyTotals.reduce((s, d) => s + d.total_seconds, 0);

    const lastWeekData = {
      weeklyTotalHours: Math.round(lastWeekTotal / 3600 * 10) / 10,
      dailyAverageHours: Math.round(lastWeekTotal / 3600 / 7 * 10) / 10,
      topApps: lastWeekSummary.slice(0, 10),
    };

    console.log('📄 正在生成周报……');
    const report = await generateWeeklyReport(weeklyData, lastWeekData, weeklyPrompt);
    console.log(`📄 周报完成（${report.length} 字）`);

    res.json({ success: true, report });
  } catch (error) {
    console.error('周报生成失败:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/chart — 时间分布图表
app.post('/api/chart', async (req, res) => {
  try {
    const { period } = req.body;
    const now = new Date();
    let start, end, label;

    if (period === 'yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end = new Date(start.getTime() + 86400000);
      label = '昨天';
    } else if (period === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
      end = now;
      label = '本周';
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = now;
      label = '今天';
    }

    const appSummary = await aw.getAppUsageSummary(start, end);
    const top8 = appSummary.slice(0, 8);
    const totalMinutes = top8.reduce((s, a) => s + a.duration_minutes, 0);

    const chartData = top8.map((a) => ({
      app: a.app,
      duration_minutes: a.duration_minutes,
      percentage: totalMinutes > 0 ? Math.round(a.duration_minutes / totalMinutes * 100) : 0,
    }));

    const comment = await askDeepSeek(
      `请用 2-3 句话概括${label}的时间分布图。Top 应用：${chartData.map(d => `${d.app}(${d.percentage}%)`).join('、')}。直接说结论。`,
      [{ label, appSummary, topTitles: [] }],
      []
    );

    console.log(`📊 图表 [${label}]：${chartData.length} 个应用，${Math.round(totalMinutes)} 分钟`);
    res.json({ success: true, chartData, aiComment: comment });
  } catch (error) {
    console.error('图表生成失败:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// ============================================================
// 全局 404 兜底
// ============================================================
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, error: `接口 ${req.path} 不存在` });
  } else {
    res.status(404).send('404 Not Found');
  }
});

// ============================================================
// 服务器启动（带环境检查）
// ============================================================
const server = app.listen(PORT, async () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🧠 AW-AI Coach v1.0                ║');
  console.log(`║   http://localhost:${PORT}                  ║`);
  console.log('╚══════════════════════════════════════╝\n');

  // 检查 .env 配置
  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY.includes('把你的')) {
    console.warn('⚠️  未配置 DeepSeek API Key，请在 .env 文件中设置 DEEPSEEK_API_KEY');
  } else {
    console.log('🔑 DeepSeek API Key 已配置');
  }

  // 检查 AW 连接
  try {
    const buckets = await aw.getBuckets();
    const bucketCount = Object.keys(buckets).length;
    console.log(`🟢 ActivityWatch 已连接（${bucketCount} 个数据桶）`);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const summary = await aw.getAppUsageSummary(startOfToday, now);
    const totalMin = summary.reduce((s, a) => s + a.duration_minutes, 0);
    console.log(`📊 今日已记录 ${Math.round(totalMin)} 分钟（${summary.length} 个应用）\n`);
  } catch (error) {
    console.warn('🔴 ActivityWatch 未连接 — 聊天和图表功能将不可用');
    console.warn(`   请启动 ActivityWatch 后重新运行 node server.js\n`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`🔴 端口 ${PORT} 已被占用，请先关闭占用该端口的进程`);
    process.exit(1);
  } else {
    console.error('服务器启动失败:', err.message);
    process.exit(1);
  }
});
