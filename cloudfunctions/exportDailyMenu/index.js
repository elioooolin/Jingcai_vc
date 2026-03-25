/**
 * 导出当日Excel餐单的云函数
 * 验证待确认订单并生成Excel餐单文件
 */

const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 云函数入口函数
 */
exports.main = async (event, context) => {
  const { store, date } = event;
  
  console.log('接收到导出餐单请求 - 门店:', store, '日期:', date);
  
  // 验证必要参数
  if (!store || !date) {
    return {
      success: false,
      message: '门店和日期不能为空'
    };
  }
  
  if (store === 'all') {
    return {
      success: false,
      message: '请选择具体门店'
    };
  }
  
  try {
    const currentUser = await getCurrentUser(event);
    if (!currentUser || !['admin', 'staff'].includes(currentUser.role)) {
      return {
        success: false,
        message: '需要管理员或员工权限'
      };
    }

    // 构建日期查询条件
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    console.log('查询日期范围:', startOfDay, 'to', endOfDay);
    
    // 1. 先查询所有相关订单
    const allOrdersResult = await db.collection('orders')
      .where({
        store: store,
        orderDate: db.command.gte(startOfDay).and(db.command.lte(endOfDay))
      })
      .get();
    
    console.log('查询到订单总数:', allOrdersResult.data.length);
    
    // 2. 手动过滤出待确认订单
    const pendingOrders = allOrdersResult.data.filter(order => 
      order.status === 'pending' && 
      order.isMock !== true && 
      order.isActive !== false
    );
    
    console.log('待确认订单数:', pendingOrders.length);
    
    // 3. 如果有待确认订单，返回错误
    if (pendingOrders.length > 0) {
      return {
        success: false,
        message: '当前日期的门店餐单有待确认订单，不可导出表格'
      };
    }
    
    // 4. 手动过滤出已确认订单
    const confirmedOrders = allOrdersResult.data.filter(order => 
      order.status === 'confirmed' && 
      order.isMock !== true && 
      order.isActive !== false
    );
    
    console.log('已确认订单数:', confirmedOrders.length);
    
    if (confirmedOrders.length === 0) {
      return {
        success: false,
        message: '当前日期没有已确认的订单，无法导出餐单'
      };
    }
    
    // 5. 获取所有相关用户信息
    const userIds = [...new Set(confirmedOrders.map(order => order.userId))];
    const usersResult = await db.collection('users')
      .where({
        _id: db.command.in(userIds)
      })
      .get();
    
    // 创建用户信息映射
    const usersMap = {};
    usersResult.data.forEach(user => {
      usersMap[user._id] = user;
    });
    
    // 6. 按房号（数字）升序排序订单
    const sortedOrders = confirmedOrders.slice().sort((a, b) => {
      const userA = usersMap[a.userId] || {};
      const userB = usersMap[b.userId] || {};
      const roomA = parseInt((userA.room || '').toString().match(/\d+/)?.[0] || '', 10);
      const roomB = parseInt((userB.room || '').toString().match(/\d+/)?.[0] || '', 10);
      if (isNaN(roomA) && isNaN(roomB)) return 0;
      if (isNaN(roomA)) return 1; // 无法解析的房号排后
      if (isNaN(roomB)) return -1;
      return roomA - roomB;
    });

    // 7. 生成Excel数据（使用排序后的订单）
    const excelData = generateExcelData(sortedOrders, usersMap, store, date);
    
    // 8. 生成文件名
    const storeName = getStoreShortName(store);
    const dateStr = formatDateForFileName(date);
    const randomNumber = Math.random().toString(36).substring(2, 8);
    const fileName = `${storeName}_${dateStr}_餐单_${randomNumber}.xlsx`;
    
    console.log('生成文件名:', fileName);
    console.log('Excel数据行数:', excelData.length);
    
    // 9. 生成Excel文件
    const workbook = await createWorkbook(excelData, sortedOrders.length);
    const excelBuffer = await workbook.xlsx.writeBuffer();
    
    console.log('Excel文件生成成功，大小:', excelBuffer.length, 'bytes');
    
    // 10. 上传到云存储
    try {
      const uploadResult = await cloud.uploadFile({
        cloudPath: `menu-exports/${fileName}`,
        fileContent: excelBuffer
      });
      
      console.log('文件上传成功:', uploadResult.fileID);
      
      // 获取临时下载链接
      const tempUrlResult = await cloud.getTempFileURL({
        fileList: [uploadResult.fileID]
      });
      
      console.log('临时链接获取结果:', tempUrlResult);
      
      if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
        const fileUrl = tempUrlResult.fileList[0].tempFileURL;
        const fileStatus = tempUrlResult.fileList[0].status;
        
        console.log('文件下载链接:', fileUrl);
        console.log('文件状态:', fileStatus);
        
        if (fileStatus === 0) {
          return {
            success: true,
            message: '餐单导出成功',
            fileName: fileName,
            fileUrl: fileUrl,
            fileId: uploadResult.fileID,
            ordersCount: sortedOrders.length,
            fileSize: excelBuffer.length
          };
        } else {
          console.error('获取临时链接失败，状态码:', fileStatus);
          return {
            success: false,
            message: '获取文件下载链接失败'
          };
        }
      } else {
        console.error('临时链接结果为空');
        return {
          success: false,
          message: '获取文件下载链接失败'
        };
      }
      
    } catch (uploadError) {
      console.error('文件上传失败:', uploadError);
      return {
        success: false,
        message: '文件上传失败: ' + uploadError.message
      };
    }
    
  } catch (error) {
    console.error('导出餐单失败:', error);
    return {
      success: false,
      message: '导出餐单失败: ' + error.message
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

/**
 * 生成Excel数据
 */
function generateExcelData(orders, usersMap, store, date) {
  const excelData = [];
  
  // 添加表头信息
  excelData.push(['门店', store]);
  excelData.push(['日期', date]);
  excelData.push(['']); // 空行
  
  // 构建横向表格数据
  // 第一列是字段标题，后续列是每个客户的数据
  
  // 1. 构建表头行（客户信息行）
  const customerNameRow = ['客户信息'];
  orders.forEach(order => {
    const user = usersMap[order.userId] || {};
    customerNameRow.push(user.name + '-' + user.room);
  });
  excelData.push(customerNameRow);
  
  const breakfastRow = ['早餐'];
  const lunchDish1Row = ['午餐菜品'];
  const lunchDish2Row = [''];
  const lunchSoupRow = ['午餐汤品'];
  const dinnerDish1Row = ['晚餐菜品'];
  const dinnerDish2Row = [''];
  const dinnerSoupRow = ['晚餐汤品'];
  const supplementRow = ['高补餐'];
  const dietPreferenceRow = ['饮食偏好/忌口'];
  const specialRequirementsRow = ['特殊备注'];

  orders.forEach(order => {
    const orderDetails = order.order_details || {};
    const user = usersMap[order.userId] || {};
    breakfastRow.push(orderDetails.breakfast);
    const lunch = orderDetails.lunch || [];
    lunchDish1Row.push(lunch[0] || '');
    lunchDish2Row.push(lunch[1] || '');
    lunchSoupRow.push(lunch[2] || '');
    const dinner = orderDetails.dinner || [];
    dinnerDish1Row.push(dinner[0] || '');
    dinnerDish2Row.push(dinner[1] || '');
    dinnerSoupRow.push(dinner[2] || '');
    supplementRow.push(orderDetails.supplement || '');
    dietPreferenceRow.push(user.dietPreference || '');
    specialRequirementsRow.push(orderDetails.special_requirements);
  });
  excelData.push(
    breakfastRow,
    lunchSoupRow,
    lunchDish1Row,
    lunchDish2Row,
    dinnerSoupRow,
    dinnerDish1Row,
    dinnerDish2Row,
    supplementRow,
    dietPreferenceRow,
    specialRequirementsRow
  );

  return excelData;
}

async function createWorkbook(excelData, orderCount) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('餐单');

  excelData.forEach((row) => {
    worksheet.addRow(row);
  });

  worksheet.columns = [
    { width: 20 },
    ...Array.from({ length: orderCount }, () => ({ width: 15 }))
  ];

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: true
      };
    });
  });

  const highlightRows = new Set(['高补餐', '饮食偏好/忌口']);
  worksheet.eachRow((row) => {
    const rowLabel = row.getCell(1).value;
    const shouldHighlight = typeof rowLabel === 'string' && highlightRows.has(rowLabel);
    if (!shouldHighlight) {
      return;
    }

    row.eachCell((cell, colNumber) => {
      if (colNumber === 1) {
        return;
      }

      const value = cell.value;
      if (value === null || value === undefined || String(value).trim() === '') {
        return;
      }

      cell.font = {
        bold: true,
        color: { argb: 'FFFF0000' }
      };
    });
  });

  return workbook;
}

/**
 * 获取门店简称
 */
function getStoreShortName(store) {
  const storeMap = {
    '爱睦·梅溪湖店': '梅溪湖店',
    '爱睦轻予·德思勤店': '德思勤店',
  };
  
  return storeMap[store] || store;
}

/**
 * 格式化日期为文件名格式 YYYYMMDD
 */
function formatDateForFileName(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}
