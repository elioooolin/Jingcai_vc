// 获取管理员统计数据
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  console.log('获取管理员统计数据请求:', event);
  
  try {
    // 获取今天的日期
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD 格式
    
    console.log('今天日期:', todayStr);
    
    // 1. 计算在住客户数
    // 条件：userType为customer, status为active，且 checkInDate + totalDays 不晚于今天
    const usersResult = await db.collection('users')
      .where({
        userType: 'customer',
        status: 'active'
      })
      .get();
    
    console.log('获取到的用户数据:', usersResult.data.length);
    
    let activeCustomers = 0;
    
    for (const user of usersResult.data) {
      if (user.checkInDate && user.totalDays) {
        try {
          // 计算退房日期 = checkInDate + totalDays
          const checkInDate = new Date(user.checkInDate);
          const checkOutDate = new Date(checkInDate);
          checkOutDate.setDate(checkInDate.getDate() + parseInt(user.totalDays));
          
          // 如果退房日期不早于今天，说明还在住
          if (checkOutDate >= today) {
            activeCustomers++;
            console.log(`客户 ${user.name} 仍在住: 入住${user.checkInDate}, 总天数${user.totalDays}, 退房${checkOutDate.toISOString().split('T')[0]}`);
          } else {
            console.log(`客户 ${user.name} 已退房: 入住${user.checkInDate}, 总天数${user.totalDays}, 退房${checkOutDate.toISOString().split('T')[0]}`);
          }
        } catch (error) {
          console.error(`计算客户 ${user.name} 住宿状态时出错:`, error);
        }
      } else {
        console.log(`客户 ${user.name} 缺少入住日期或总天数信息`);
      }
    }
    
    console.log('在住客户总数:', activeCustomers);
    
    // 2. 计算待确认订单数
    // 条件：status为pending且isMock不为true
    const ordersResult = await db.collection('orders')
      .where({
        status: 'pending'
      })
      .get();
    
    console.log('获取到的pending订单数据:', ordersResult.data.length);
    
    // 过滤掉isMock为true的订单
    const pendingOrders = ordersResult.data.filter(order => order.isMock !== true);
    
    console.log('真实待确认订单数:', pendingOrders.length);
    
    const stats = {
      totalCustomers: activeCustomers,
      pendingOrders: pendingOrders.length
    };
    
    console.log('统计结果:', stats);
    
    return {
      success: true,
      stats: stats,
      message: '统计数据获取成功'
    };
    
  } catch (error) {
    console.error('获取管理员统计数据失败:', error);
    return {
      success: false,
      message: '获取统计数据失败: ' + error.message,
      stats: {
        totalCustomers: 0,
        pendingOrders: 0
      }
    };
  }
};
