/**
 * 删除客户的云函数
 * 软删除用户（设置status为inactive）和相关订单（设置isActive为false）
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
  const { customerId } = event;
  
  console.log('接收到删除客户请求，客户ID:', customerId);
  
  // 验证必要参数
  if (!customerId) {
    return {
      success: false,
      message: '客户ID不能为空'
    };
  }
  
  try {
    // 1. 检查客户是否存在
    const customerResult = await db.collection('users')
      .doc(customerId)
      .get();
    
    if (!customerResult.data) {
      return {
        success: false,
        message: '客户不存在'
      };
    }
    
    const customer = customerResult.data;
    console.log('找到客户:', customer.name, customer.phone);
    
    // 2. 软删除客户（设置status为inactive）
    console.log('开始软删除客户...');
    await db.collection('users')
      .doc(customerId)
      .update({
        data: {
          status: 'inactive',
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      });
    
    console.log('✅ 客户状态已更新为inactive');
    
    // 3. 查找该客户的所有订单
    console.log('查找客户的所有订单...');
    const ordersResult = await db.collection('orders')
      .where({
        userId: customerId
      })
      .get();
    
    console.log(`找到 ${ordersResult.data.length} 个相关订单`);
    
    // 4. 软删除所有相关订单（设置isActive为false）
    let updatedOrdersCount = 0;
    
    if (ordersResult.data.length > 0) {
      console.log('开始软删除相关订单...');
      
      // 逐个更新订单（避免并发问题）
      for (const order of ordersResult.data) {
        try {
          await db.collection('orders')
            .doc(order._id)
            .update({
              data: {
                isActive: false,
                deletedAt: new Date(),
                updatedAt: new Date()
              }
            });
          
          updatedOrdersCount++;
          console.log(`✅ 订单 ${order._id} 已设置为非活跃状态`);
        } catch (orderError) {
          console.error(`❌ 更新订单 ${order._id} 失败:`, orderError);
        }
      }
    }
    
    console.log(`删除操作完成 - 客户: ${customer.name}, 相关订单: ${updatedOrdersCount}/${ordersResult.data.length}`);
    
    return {
      success: true,
      message: '客户删除成功',
      customerInfo: {
        id: customerId,
        name: customer.name,
        phone: customer.phone
      },
      ordersCount: ordersResult.data.length,
      updatedOrdersCount: updatedOrdersCount
    };
    
  } catch (error) {
    console.error('删除客户失败:', error);
    return {
      success: false,
      message: '删除客户失败: ' + error.message
    };
  }
};
