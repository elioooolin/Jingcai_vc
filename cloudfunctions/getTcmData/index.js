// 获取中医数据云函数
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { userId, sessionToken } = event;
  
  try {
    const currentUser = await getCurrentUser({ db, cloud, sessionToken });
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
        message: '无权查看该用户的中医数据'
      };
    }

    // 获取用户的中医处方记录
    const rxResult = await db.collection('tcm_rx')
      .where({
        userId: userId
      })
      .orderBy('week', 'asc')
      .get();

    // 获取所有药膳方子信息
    const tcmResult = await db.collection('tcm')
      .get();

    // 为每个处方记录匹配对应的药膳方子详细信息
    const processedRxData = rxResult.data.map(rx => {
      const prescriptions = rx.rx ? rx.rx.map(rxId => {
        const tcmItem = tcmResult.data.find(item => item._id === rxId);
        return tcmItem || null;
      }).filter(item => item !== null) : [];

      return {
        ...rx,
        prescriptions: prescriptions,
        tongueImageUrl: `cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/${userId}/tongue/week_${rx.week}.JPG`
      };
    });

    // 获取药膳文化数据（茶、汤、饮、羹）
    const herbalCategories = [
      {
        category: '茶',
        name: '元气月子茶',
        description: '遵循中医古方+现代营养学，定制“一杯恢复元气”的温暖力量。',
        imageUrl: 'tcm_pics/元气月子茶.JPG',
        materials: '百合，鲜芦根，甘草，紫苏，佛手，山药，炒粳米，肉桂等',
        effects: '通气、顺气、补气、生津止渴和排湿祛寒的功效，提高人体抵抗力和免疫力；色泽淡黄味清淡如大麦茶。'
      },
      {
        category: '汤',
        name: '御膳合方汤',
        description: '古法鲜炖，因时制宜，以膳养身，一碗汤喝出好体质。',
        imageUrl: 'tcm_pics/御膳合方汤.JPG',
        materials: '百合，山药，鲜芦根，葛根，茯苓，黄精，佛手，甘草，桂皮，桂圆肉，橘皮，香橼等',
        effects: '第一周以排恶露为主，第二周起通过中医把脉问诊后根据个人体质做针对性的调理（一人一方）'
      },
      {
        category: '饮',
        name: '坤元健脾饮',
        description: '温和调理，提高脾胃对水谷精微的吸收，体质恢复更高效，让食补事半功倍。',
        imageUrl: 'tcm_pics/坤元健脾饮.JPG',
        materials: '紫苏，白扁豆花，霍香，木瓜，百合，甘草，莲子，黄精，砂仁，公丁香等天然食材',
        effects: '调理脾胃，提高脾胃对水谷精微的吸收'
      },
      {
        category: '羹',
        name: '十全养颜月子羹',
        description: '十大黄金谷物，100%纯天然食材，安神助眠，营养满分的产后能量加油站。',
        imageUrl: 'tcm_pics/十全养颜月子羹.JPG',
        materials: '黑豆、黑米、黑芝麻、黄豆、南瓜籽、核桃、红皮花生、薏米、红枣、红枸杞等',
        effects: '具有美容养颜、调理脾胃、安神助眠的作用，营养丰富，适合产后调理和日常养生'
      }
    ];

    return {
      success: true,
      data: {
        rxData: processedRxData,
        herbalCategories: herbalCategories
      }
    };

  } catch (error) {
    console.error('获取中医数据失败:', error);
    return {
      success: false,
      message: '获取数据失败',
      error: error.message
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
