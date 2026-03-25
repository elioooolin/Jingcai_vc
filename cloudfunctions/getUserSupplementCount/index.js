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
  const { userId, sessionToken } = event;
  
  console.log('获取用户高补餐次数，用户ID:', userId);
  
  if (!userId) {
    return {
      success: false,
      message: '用户ID不能为空',
      supplementCount: 0
    };
  }
  
  try {
    const currentUser = await getCurrentUser({ db, cloud, sessionToken });
    if (!currentUser || currentUser.role !== 'customer') {
      return {
        success: false,
        message: '仅已登记客户可查看高补餐次数',
        supplementCount: 0
      };
    }

    if (currentUser._id !== userId) {
      return {
        success: false,
        message: '无权查看其他用户高补餐次数',
        supplementCount: 0
      };
    }

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

async function getCurrentUser({ db, cloud, sessionToken }) {
  if (sessionToken) {
    const sessionResult = await db.collection('user_sessions').where({
      sessionToken,
      isActive: true
    }).get();

    if (sessionResult.data.length > 0) {
      const session = sessionResult.data[0];
      const isExpired = !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now();

      if (!isExpired && session.isRegistered && session.userId) {
        const userDoc = await db.collection('users').doc(session.userId).get();
        if (userDoc.data && userDoc.data.status === 'active') {
          return {
            ...userDoc.data,
            role: getUserRole(userDoc.data),
            openid: session.openid
          };
        }
      }
    }
  }

  const wxContext = cloud.getWXContext();
  if (!wxContext.OPENID) {
    return null;
  }

  const authResult = await db.collection('auth').where({
    _openid: wxContext.OPENID
  }).get();

  if (authResult.data.length === 0 || !authResult.data[0].phone) {
    return null;
  }

  const userResult = await db.collection('users').where({
    phone: authResult.data[0].phone,
    status: 'active'
  }).get();

  if (userResult.data.length === 0) {
    return null;
  }

  return {
    ...userResult.data[0],
    role: getUserRole(userResult.data[0]),
    openid: wxContext.OPENID
  };
}

function getUserRole(user) {
  if (user.role) return user.role;
  if (user.isAdmin === true || user.userType === 'admin') return 'admin';
  if (user.userType === 'staff') return 'staff';
  return 'customer';
}
