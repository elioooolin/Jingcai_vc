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
    const currentUser = await getCurrentUser(event);
    if (!currentUser) {
      return {
        success: false,
        message: '未登录或无权限'
      };
    }

    const isAdminOrStaff = ['admin', 'staff'].includes(currentUser.role);
    const isSelfCustomer = currentUser.role === 'customer' && currentUser._id === userId;
    if (!isAdminOrStaff && !isSelfCustomer) {
      return {
        success: false,
        message: '无权查看该用户信息'
      };
    }

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

async function getCurrentUser(event = {}) {
  const { sessionToken } = event;

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

  const user = userResult.data[0];
  return {
    ...user,
    role: getUserRole(user)
  };
}

function getUserRole(user) {
  if (user.role) return user.role;
  if (user.isAdmin === true || user.userType === 'admin') return 'admin';
  if (user.userType === 'staff') return 'staff';
  return 'customer';
}
