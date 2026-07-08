const axios = require('axios');

// ActivityWatch 本地 API 地址
const AW_BASE_URL = 'http://localhost:5600/api/0';

/**
 * 获取所有数据桶列表
 * 返回示例：{ "aw-watcher-window_xxx": { "id": "...", "type": "currentwindow", ... }, ... }
 */
async function getBuckets() {
  try {
    const response = await axios.get(`${AW_BASE_URL}/buckets/`);
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('无法连接到 ActivityWatch，请确认 AW 正在运行（检查系统托盘图标）');
    }
    throw new Error(`获取 AW 数据桶失败: ${error.message}`);
  }
}

/**
 * 获取指定数据桶的事件列表
 * @param {string} bucketId - 数据桶 ID，如 "aw-watcher-window_DESKTOP-U6U0ELR"
 * @param {Date} startTime - 开始时间
 * @param {Date} endTime - 结束时间
 * @param {number} limit - 最多返回条数，默认 1000
 */
async function getEvents(bucketId, startTime, endTime, limit = 1000) {
  try {
    const response = await axios.get(`${AW_BASE_URL}/buckets/${bucketId}/events`, {
      params: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        limit: limit,
      },
    });
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('无法连接到 ActivityWatch，请确认 AW 正在运行');
    }
    throw new Error(`获取事件失败: ${error.message}`);
  }
}

/**
 * 获取窗口事件的数据桶 ID（自动匹配 aw-watcher-window_ 开头的桶）
 */
async function getWindowBucketId() {
  const buckets = await getBuckets();
  const windowBucketKey = Object.keys(buckets).find((key) =>
    key.startsWith('aw-watcher-window_')
  );
  if (!windowBucketKey) {
    throw new Error('未找到窗口事件数据桶（aw-watcher-window_*），请确认 AW 的 window watcher 已启用');
  }
  return windowBucketKey;
}

/**
 * 按应用名聚合使用时长（这是给 AI 看的核心数据）
 * @param {Date} startTime - 开始时间
 * @param {Date} endTime - 结束时间
 * @returns {Array<{app: string, duration_seconds: number, duration_minutes: number}>} - 按使用时长降序排列
 */
async function getAppUsageSummary(startTime, endTime) {
  const bucketId = await getWindowBucketId();
  const events = await getEvents(bucketId, startTime, endTime, 5000);

  // 按 app 名聚合时长
  const appMap = {};
  for (const event of events) {
    const app = event.data?.app || '未知应用';
    const duration = event.duration || 0;

    if (!appMap[app]) {
      appMap[app] = 0;
    }
    appMap[app] += duration;
  }

  // 转为数组并排序
  const summary = Object.entries(appMap)
    .map(([app, duration]) => ({
      app,
      duration_seconds: Math.round(duration),
      duration_minutes: Math.round(duration / 60 * 10) / 10, // 保留一位小数
    }))
    .sort((a, b) => b.duration_seconds - a.duration_seconds);

  return summary;
}

/**
 * 获取窗口标题级别的时间分布（用于回答"哪个网页/文档用得最多"）
 * @param {Date} startTime
 * @param {Date} endTime
 * @param {string} appFilter - 可选，只查某个应用（如 "msedge.exe"）
 * @returns {Array<{title: string, app: string, duration_minutes: number}>}
 */
async function getTopTitles(startTime, endTime, appFilter = null) {
  const bucketId = await getWindowBucketId();
  const events = await getEvents(bucketId, startTime, endTime, 5000);

  // 按窗口标题聚合
  const titleMap = {};
  for (const event of events) {
    const app = event.data?.app || '未知应用';
    const title = event.data?.title || '无标题';
    const duration = event.duration || 0;

    // 如果指定了 app 过滤，只统计该应用
    if (appFilter && app !== appFilter) continue;

    const key = `${app} | ${title}`;
    if (!titleMap[key]) {
      titleMap[key] = { title, app, duration_seconds: 0 };
    }
    titleMap[key].duration_seconds += duration;
  }

  return Object.values(titleMap)
    .map((item) => ({
      ...item,
      duration_minutes: Math.round(item.duration_seconds / 60 * 10) / 10,
    }))
    .sort((a, b) => b.duration_seconds - a.duration_seconds)
    .slice(0, 20); // Top 20
}

/**
 * 获取指定日期范围的每日总时长
 * @param {Date} startTime
 * @param {Date} endTime
 * @returns {Array<{date: string, total_seconds: number, total_hours: number}>}
 */
async function getDailyTotals(startTime, endTime) {
  const bucketId = await getWindowBucketId();
  const events = await getEvents(bucketId, startTime, endTime, 10000);

  // 按天聚合
  const dayMap = {};
  for (const event of events) {
    const day = new Date(event.timestamp).toISOString().split('T')[0];
    const duration = event.duration || 0;

    if (!dayMap[day]) {
      dayMap[day] = 0;
    }
    dayMap[day] += duration;
  }

  return Object.entries(dayMap)
    .map(([date, total]) => ({
      date,
      total_seconds: Math.round(total),
      total_hours: Math.round(total / 3600 * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 获取过去 N 天的周报数据（用于周报功能）
 * @param {number} days - 天数，默认 7
 * @returns {Object} { dailyTotals, topApps, weeklyTotal, dailyAverage }
 */
async function getWeeklySummary(days = 7) {
  const now = new Date();
  const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [dailyTotals, appSummary] = await Promise.all([
    getDailyTotals(startTime, now),
    getAppUsageSummary(startTime, now),
  ]);

  const weeklyTotal = dailyTotals.reduce((sum, d) => sum + d.total_seconds, 0);

  return {
    dailyTotals,
    topApps: appSummary.slice(0, 10), // Top 10
    weeklyTotalSeconds: weeklyTotal,
    weeklyTotalHours: Math.round(weeklyTotal / 3600 * 10) / 10,
    dailyAverageHours: Math.round(weeklyTotal / 3600 / days * 10) / 10,
    days: days,
  };
}

module.exports = {
  getBuckets,
  getEvents,
  getWindowBucketId,
  getAppUsageSummary,
  getTopTitles,
  getDailyTotals,
  getWeeklySummary,
};
