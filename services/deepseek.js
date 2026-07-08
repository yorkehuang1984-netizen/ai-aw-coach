const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

/**
 * 调用 DeepSeek 回答用户问题
 * @param {string} userMessage - 用户输入
 * @param {Array} dataPackages - [{label, appSummary, topTitles}, ...] 可能多时间段
 * @param {Array} history - 对话历史
 * @returns {string} AI 回复
 */
async function askDeepSeek(userMessage, dataPackages, history = []) {
  // 为每个时间段格式化数据
  const dataSections = dataPackages.map((pkg) => {
    const appText = pkg.appSummary
      .slice(0, 20)
      .map((item, i) => `${i + 1}. ${item.app} — ${item.duration_minutes} 分钟`)
      .join('\n');

    const titleText = pkg.topTitles
      .slice(0, 15)
      .map((item, i) => `${i + 1}. [${item.app}] ${item.title} — ${item.duration_minutes} 分钟`)
      .join('\n');

    const totalMinutes = pkg.appSummary.reduce((s, a) => s + a.duration_minutes, 0);
    const appCount = pkg.appSummary.length;

    return `【${pkg.label}】总计 ${Math.round(totalMinutes)} 分钟，涉及 ${appCount} 个应用
应用排行：
${appText}

窗口标题排行：
${titleText}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `你是"AW-AI Coach"，基于 ActivityWatch 本地时间追踪数据的个人效率助手。
你可以回答几乎所有关于电脑使用时间的问题，因为你拥有完整的窗口活动数据。

## 你能回答的问题类型（不限于此）：

📊 **数据查询类**
- 某天/某周用了多久某个应用（"我今天用了多久 VS Code？"）
- 哪个应用/网页用得最多（"昨天浏览器里哪个网站待最久？"）
- 具体时间段的总时长（"我这周一共用了多久电脑？"）

📈 **对比分析类**
- 不同时间段对比（"今天和昨天比，哪个更高效？"）
- 应用之间的对比（"VS Code 和浏览器哪个用得多？"）
- 趋势变化（"本周和上周娱乐时间有什么变化？"）

🏷️ **分类与效率类**
- 根据应用名推断类别（浏览器=可能娱乐/学习，IDE=工作，游戏=娱乐）
- 评估时间分配是否健康
- 给出具体的效率改进建议

📋 **排行与分布类**
- Top N 排行（"排前 3 的应用是哪些？"）
- 时间占比（"游戏占我总时间的百分之多少？"）
- 使用频率分析

## 回答规则：
1. 用中文，简洁友好，引用具体数字
2. 如果数据不足以回答问题，诚实说明，不要编造
3. 如果用户问了和数据完全无关的问题，友好提醒"我是时间分析助手"
4. 如果问图表/饼图/可视化，回复末尾加 [CHART] 标记
5. 对比问题时给出变化百分比和趋势判断
6. 适当给出效率建议，但不要每句话都说教

## 当前数据：
${dataSections}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    if (error.status === 401) {
      throw new Error('DeepSeek API Key 无效，请检查 .env 文件');
    }
    if (error.status === 429) {
      throw new Error('DeepSeek API 请求过于频繁或额度不足，请稍后再试');
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('无法连接到 DeepSeek 服务器，请检查网络');
    }
    throw new Error(`DeepSeek 调用失败: ${error.message}`);
  }
}

/**
 * 生成反思周报
 * @param {Object} weeklyData - getWeeklySummary() 的返回数据
 * @param {Object|null} lastWeekData - 上周的对比数据（可选）
 * @param {string} weeklyPrompt - 周报 system prompt（从 prompts/weekly.md 读取）
 * @returns {string} Markdown 格式的周报
 */
async function generateWeeklyReport(weeklyData, lastWeekData, weeklyPrompt) {
  // 格式化本周数据
  const thisWeekText = `
本周总时长：${weeklyData.weeklyTotalHours} 小时
日均使用：${weeklyData.dailyAverageHours} 小时
统计天数：${weeklyData.days} 天
涉及应用数：${weeklyData.topApps.length} 个

每日使用详情：
${weeklyData.dailyTotals.map(d => `- ${d.date}: ${d.total_hours} 小时`).join('\n')}

应用排行 Top 10：
${weeklyData.topApps.map((a, i) => `${i + 1}. ${a.app} — ${a.duration_minutes} 分钟`).join('\n')}`;

  // 格式化上周对比数据
  let comparisonText = '';
  if (lastWeekData && lastWeekData.weeklyTotalHours > 0) {
    const change = weeklyData.weeklyTotalHours - lastWeekData.weeklyTotalHours;
    const changePercent = Math.round(change / lastWeekData.weeklyTotalHours * 100);
    const direction = change > 0 ? '增加' : '减少';

    comparisonText = `
上周总时长：${lastWeekData.weeklyTotalHours} 小时
上周日均：${lastWeekData.dailyAverageHours} 小时

与上周对比：总时长${direction}了 ${Math.abs(changePercent)}%（${Math.abs(Math.round(change * 10) / 10)} 小时）

上周应用排行：
${lastWeekData.topApps.slice(0, 5).map((a, i) => `${i + 1}. ${a.app} — ${a.duration_minutes} 分钟`).join('\n')}`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: weeklyPrompt },
        { role: 'user', content: `请根据以下数据生成反思周报：\n\n【本周数据】${thisWeekText}\n\n【上周对比数据】${comparisonText || '无上周数据'}` },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    if (error.status === 401) {
      throw new Error('DeepSeek API Key 无效，请检查 .env 文件');
    }
    if (error.status === 429) {
      throw new Error('DeepSeek API 请求过于频繁或额度不足，请稍后再试');
    }
    throw new Error(`生成周报失败: ${error.message}`);
  }
}

module.exports = { askDeepSeek, generateWeeklyReport };
