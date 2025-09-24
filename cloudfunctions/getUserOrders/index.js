/**
 * 获取用户所有订单的云函数
 * 用于 Dashboard 页面加载时检查用户已有的订单
 */

const cloud = require('wx-server-sdk');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 云函数入口函数
 */
exports.main = async (event, context) => {
  const { userId } = event;
  
  console.log('获取用户订单，用户ID:', userId);
  
  if (!userId) {
    return {
      success: false,
      message: '用户ID不能为空',
      orders: []
    };
  }
  
  try {
    // 查询用户的所有订单
    const ordersResult = await db.collection('orders')
      .where({
        userId: userId
      })
      .orderBy('orderDate', 'desc')  // 按订单日期降序排列
      .get();
    
    console.log(`找到用户 ${userId} 的 ${ordersResult.data.length} 个订单`);
    
    // 处理订单数据，提取关键信息
    const orders = ordersResult.data.map(order => ({
      orderId: order._id,
      orderDate: order.orderDate,
      status: order.status,
      createdAt: order.createdAt,
      // 提取订单日期字符串（YYYY-MM-DD格式）
      orderDateString: formatDateToString(order.orderDate),
      // 订单摘要信息
      orderSummary: generateOrderSummary(order.order_details)
    }));
    
    // 创建已订餐日期的集合，用于快速查找
    const orderedDates = new Set(orders.map(order => order.orderDateString));
    
    console.log('已订餐的日期:', Array.from(orderedDates));
    
    return {
      success: true,
      message: '获取用户订单成功',
      orders: orders,
      orderedDates: Array.from(orderedDates),  // 已订餐日期数组
      totalCount: orders.length
    };
    
  } catch (error) {
    console.error('获取用户订单失败:', error);
    return {
      success: false,
      message: '获取用户订单失败',
      error: error.message,
      orders: [],
      orderedDates: []
    };
  }
};

/**
 * 将日期对象格式化为 YYYY-MM-DD 字符串
 * @param {Date} date 日期对象
 * @returns {string} 格式化后的日期字符串
 */
function formatDateToString(date) {
  if (!date) return '';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 生成订单摘要信息
 * @param {Object} orderDetails 订单详情
 * @returns {Object} 订单摘要
 */
function generateOrderSummary(orderDetails) {
  if (!orderDetails) return {};
  
  const summary = {};
  
  // 早餐
  if (orderDetails.breakfast) {
    summary.breakfast = orderDetails.breakfast;
  }
  
  // 午餐
  if (orderDetails.lunch && Array.isArray(orderDetails.lunch)) {
    summary.lunch = orderDetails.lunch.join(' + ');
  }
  
  // 晚餐
  if (orderDetails.dinner && Array.isArray(orderDetails.dinner)) {
    summary.dinner = orderDetails.dinner.join(' + ');
  }
  
  // 高补餐
  if (orderDetails.supplement) {
    summary.supplement = orderDetails.supplement;
  }
  
  // 特殊需求
  if (orderDetails.special_requirements) {
    summary.special_requirements = orderDetails.special_requirements;
  }
  
  return summary;
}
