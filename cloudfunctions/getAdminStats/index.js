// 获取管理员统计数据
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const PAGE_SIZE = 100;

exports.main = async (event, context) => {
  console.log('获取管理员统计数据请求:', event);
  
  try {
    const currentUser = await getCurrentUser(event);
    if (!currentUser || !['admin', 'staff'].includes(currentUser.role)) {
      return {
        success: false,
        message: '需要管理员或员工权限',
        stats: {
          totalCustomers: 0,
          pendingOrders: 0
        }
      };
    }

    // 获取今天的日期
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD 格式
    
    console.log('今天日期:', todayStr);
    
    // 1. 计算在住客户数
    // 条件：userType为customer, status为active，且 checkInDate + totalDays 不晚于今天
    const usersResult = await getAllDocuments('users', {
      userType: 'customer',
      status: 'active',
    });
    
    console.log('获取到的用户数据:', usersResult.length);
    
    let activeCustomers = 0;
    
    for (const user of usersResult) {
      
      if (user.checkInDate && user.totalDays && user.isMock !== true) {
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
    const ordersResult = await getAllDocuments('orders', {
      status: 'pending'
    });
    
    console.log('获取到的pending订单数据:', ordersResult.length);
    
    // 过滤掉isMock为true和isActive为false的订单
    const pendingOrders = ordersResult.filter(order => 
      order.isMock !== true && order.isActive !== false
    );
    
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

async function getAllDocuments(collectionName, whereCondition) {
  let allData = [];
  let skip = 0;

  while (true) {
    const result = await db.collection(collectionName)
      .where(whereCondition)
      .skip(skip)
      .limit(PAGE_SIZE)
      .get();

    const batch = result.data || [];
    allData = allData.concat(batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    skip += PAGE_SIZE;
  }

  return allData;
}

function getUserRole(user) {
  if (user.role) return user.role;
  if (user.isAdmin === true || user.userType === 'admin') return 'admin';
  if (user.userType === 'staff') return 'staff';
  return 'customer';
}
