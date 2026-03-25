// 删除中医处方记录和舌苔图云函数
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { rxId, userId, week, sessionToken } = event;
  
  try {
    const currentUser = await getCurrentUser({ sessionToken });
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        message: '需要管理员权限'
      };
    }

    // 参数验证
    if (!rxId || !userId || !week) {
      return {
        success: false,
        message: '缺少必要参数'
      };
    }

    // 1. 删除云存储中的舌苔图
    // 使用完整的 cloud:// 路径
    let fileDeleteSuccess = false;
    try {
      const cloudPath = `cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/${userId}/tongue/week_${week}.JPG`;
      console.log('准备删除舌苔图，路径:', cloudPath);
      
      const deleteResult = await cloud.deleteFile({
        fileList: [cloudPath]
      });
      console.log('删除舌苔图结果:', JSON.stringify(deleteResult));
      
      if (deleteResult.fileList && deleteResult.fileList[0]) {
        const fileResult = deleteResult.fileList[0];
        fileDeleteSuccess = fileResult.status === 0;
        
        if (fileDeleteSuccess) {
          console.log('舌苔图删除成功');
        } else {
          console.log('舌苔图删除失败:', fileResult.errMsg, 'status:', fileResult.status);
        }
      }
    } catch (deleteError) {
      console.error('删除舌苔图异常:', deleteError);
      // 图片可能不存在，继续删除数据库记录
    }

    // 2. 删除数据库记录
    await db.collection('tcm_rx').doc(rxId).remove();
    
    console.log(`处方记录删除成功: ${rxId}, 舌苔图删除: ${fileDeleteSuccess ? '成功' : '失败或不存在'}`);

    return {
      success: true,
      message: '删除成功',
      data: {
        fileDeleted: fileDeleteSuccess
      }
    };

  } catch (error) {
    console.error('删除处方记录失败:', error);
    return {
      success: false,
      message: '删除失败',
      error: error.message
    };
  }
};

async function getCurrentUser({ sessionToken } = {}) {
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
