/**
 * 获取用户高补餐次数的云函数
 * 从 users 集合中实时获取指定用户的 supplementCount 值
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
  
  console.log('获取用户高补餐次数，用户ID:', userId);
  
  if (!userId) {
    return {
      success: false,
      message: '用户ID不能为空',
      supplementCount: 0
    };
  }
  
  try {
    // 从 users 集合中查询用户信息
    const userResult = await db.collection('users')
      .doc(userId)
      .get();
    
    if (!userResult.data) {
      console.log('用户不存在:', userId);
      return {
        success: false,
        message: '用户不存在',
        supplementCount: 0
      };
    }
    
    const user = userResult.data;
    const supplementCount = user.supplementCount || 0;
    
    console.log(`用户 ${userId} 的高补餐次数: ${supplementCount}`);
    
    return {
      success: true,
      message: '获取用户高补餐次数成功',
      supplementCount: supplementCount,
      userId: userId
    };
    
  } catch (error) {
    console.error('获取用户高补餐次数失败:', error);
    return {
      success: false,
      message: '获取用户高补餐次数失败',
      error: error.message,
      supplementCount: 0
    };
  }
};
