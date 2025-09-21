const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { userId } = event;
  
  console.log('获取用户信息，用户ID:', userId);
  
  if (!userId) {
    return {
      success: false,
      message: '用户ID不能为空'
    };
  }
  
  try {
    // 从users集合获取用户完整信息
    const userResult = await db.collection('users')
      .doc(userId)
      .get();
    
    if (!userResult.data) {
      return {
        success: false,
        message: '用户不存在'
      };
    }
    
    const userInfo = userResult.data;
    
    console.log('用户信息获取成功');
    
    return {
      success: true,
      userInfo: userInfo
    };
    
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return {
      success: false,
      message: '获取用户信息失败',
      error: error.message
    };
  }
};
