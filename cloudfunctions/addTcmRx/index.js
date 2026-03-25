// 添加中医处方记录云函数
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { userId, week, note, selectedRxIds, tongueImageBase64, sessionToken } = event;
  
  try {
    const currentUser = await getCurrentUser({ sessionToken });
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        message: '需要管理员权限'
      };
    }

    // 参数验证
    if (!userId || !week) {
      return {
        success: false,
        message: '缺少必要参数'
      };
    }

    // 检查该用户该周次是否已存在处方记录
    const existingRx = await db.collection('tcm_rx')
      .where({
        userId: userId,
        week: parseInt(week)
      })
      .get();

    if (existingRx.data && existingRx.data.length > 0) {
      return {
        success: false,
        message: '该周次处方已存在，请删除现存处方后再上传',
        code: 'DUPLICATE_WEEK'
      };
    }

    // 1. 上传舌苔图到云存储
    if (tongueImageBase64) {
      try {
        const cloudPath = `${userId}/tongue/week_${week}.JPG`;
        
        // 将 base64 转换为 Buffer
        const base64Data = tongueImageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // 上传到云存储
        const uploadResult = await cloud.uploadFile({
          cloudPath: cloudPath,
          fileContent: buffer
        });
        
        console.log('舌苔图上传成功:', uploadResult.fileID);
      } catch (uploadError) {
        console.error('舌苔图上传失败:', uploadError);
        return {
          success: false,
          message: '舌苔图上传失败',
          error: uploadError.message
        };
      }
    }

    // 2. 保存处方记录到数据库
    const rxData = {
      userId: userId,
      week: parseInt(week),
      note: note || '',
      rx: selectedRxIds || [],
      createdAt: new Date().toISOString().split('T')[0], // YYYY-MM-DD 格式
      createdTime: new Date()
    };

    const addResult = await db.collection('tcm_rx').add({
      data: rxData
    });

    console.log('处方记录保存成功:', addResult._id);

    return {
      success: true,
      message: '处方记录添加成功',
      data: {
        rxId: addResult._id
      }
    };

  } catch (error) {
    console.error('添加处方记录失败:', error);
    return {
      success: false,
      message: '添加处方记录失败',
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
