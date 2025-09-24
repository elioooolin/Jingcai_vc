/**
 * 获取管理员订单数据的云函数
 * 根据门店和日期筛选订单
 */

const cloud = require('wx-server-sdk');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 云函数入口函数
 */
exports.main = async (event, context) => {
  const { store, date } = event;
  
  console.log('获取管理员订单数据请求 - 门店:', store, '日期:', date);
  
  try {
    // 构建查询条件（不包含isMock筛选，后续手动过滤）
    let whereCondition = {};
    
    // 添加门店筛选条件
    if (store && store !== 'all') {
      whereCondition.store = store;
    }
    
    // 添加日期筛选条件
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      whereCondition.orderDate = _.gte(startOfDay).and(_.lte(endOfDay));
    }
    
    console.log('查询条件:', whereCondition);
    
    // 查询订单数据
    const ordersResult = await db.collection('orders')
      .where(whereCondition)
      .orderBy('createdAt', 'desc')
      .get();
    
    console.log('获取到的订单数据:', ordersResult.data.length);
    
    // 手动过滤掉isMock为true和isActive为false的订单
    const filteredOrders = ordersResult.data.filter(order => 
      order.isMock !== true && order.isActive !== false
    );
    
    console.log('过滤后的订单数据:', filteredOrders.length);
    
    console.log(`查询到 ${ordersResult.data.length} 条订单记录，过滤后 ${filteredOrders.length} 条`);
    
    // 获取所有相关用户信息
    const userIds = [...new Set(filteredOrders.map(order => order.userId))];
    let usersMap = {};
    
    if (userIds.length > 0) {
      const usersResult = await db.collection('users')
        .where({
          _id: _.in(userIds)
        })
        .get();
      
      // 构建用户信息映射
      usersResult.data.forEach(user => {
        usersMap[user._id] = user;
      });
    }
    
    // 格式化订单数据
    const formattedOrders = filteredOrders.map(order => {
      const user = usersMap[order.userId] || {};
      
      return {
        orderId: order._id,
        customerName: user.name || '未知客户',
        customerPhone: order.phone || user.phone || '',
        room: user.room || '',
        store: order.store || user.store || '',
        orderDate: order.orderDate,
        orderDateString: formatDate(order.orderDate),
        submitTime: formatDateTime(order.createdAt),
        status: order.status || 'pending',
        statusText: getStatusText(order.status),
        orderDetails: order.order_details, // 返回原始订单详情结构
        orderSummary: generateOrderSummary(order.order_details), // 保留摘要用于显示
        specialRequirements: order.order_details?.special_requirements || '',
        supplement: order.order_details?.supplement || null
      };
    });
    
    return {
      success: true,
      orders: formattedOrders,
      total: formattedOrders.length,
      queryCondition: {
        store: store || 'all',
        date: date || 'all'
      }
    };
    
  } catch (error) {
    console.error('获取管理员订单数据失败:', error);
    return {
      success: false,
      message: '获取订单数据失败',
      error: error.message,
      orders: [],
      total: 0
    };
  }
};

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期时间为 MM-DD HH:mm
 */
function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
  const statusMap = {
    'pending': '待确认',
    'confirmed': '已确认',
    'preparing': '准备中',
    'completed': '已完成',
    'cancelled': '已取消'
  };
  return statusMap[status] || '未知状态';
}

/**
 * 生成订单摘要
 */
function generateOrderSummary(orderDetails) {
  if (!orderDetails) return '';
  
  const summaryParts = [];
  
  // 早餐 - 处理字符串格式
  if (orderDetails.breakfast) {
    if (typeof orderDetails.breakfast === 'string') {
      summaryParts.push(`早餐: ${orderDetails.breakfast}`);
    } else if (Array.isArray(orderDetails.breakfast)) {
      summaryParts.push(`早餐: ${orderDetails.breakfast.join('、')}`);
    }
  }
  
  // 午餐 - 处理数组格式
  if (orderDetails.lunch && Array.isArray(orderDetails.lunch) && orderDetails.lunch.length > 0) {
    summaryParts.push(`午餐: ${orderDetails.lunch.join('、')}`);
  }
  
  // 晚餐 - 处理数组格式
  if (orderDetails.dinner && Array.isArray(orderDetails.dinner) && orderDetails.dinner.length > 0) {
    summaryParts.push(`晚餐: ${orderDetails.dinner.join('、')}`);
  }
  
  // 高补餐 - 处理字符串格式
  if (orderDetails.supplement) {
    if (typeof orderDetails.supplement === 'string') {
      summaryParts.push(`高补餐: ${orderDetails.supplement}`);
    } else if (Array.isArray(orderDetails.supplement)) {
      summaryParts.push(`高补餐: ${orderDetails.supplement.join('、')}`);
    }
  }
  
  return summaryParts.join(' | ');
}
