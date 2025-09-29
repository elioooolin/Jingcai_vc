/**
 * 导出当日Excel餐单的云函数
 * 验证待确认订单并生成Excel餐单文件
 */

const cloud = require('wx-server-sdk');
const XLSX = require('xlsx');

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
    
    // 6. 生成Excel数据
    const excelData = generateExcelData(confirmedOrders, usersMap, store, date);
    
    // 7. 生成文件名
    const storeName = getStoreShortName(store);
    const dateStr = formatDateForFileName(date);
    const randomNumber = Math.random().toString(36).substring(2, 8);
    const fileName = `${storeName}_${dateStr}_餐单_${randomNumber}.xlsx`;
    
    console.log('生成文件名:', fileName);
    console.log('Excel数据行数:', excelData.length);
    
    // 8. 生成Excel文件
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    
    // 设置列宽 - 第一列是标题，后续列是客户数据
    const colWidths = [
      { wch: 20 } // 第一列（标题列）稍微宽一些
    ];
    
    // 为每个客户添加列宽设置
    for (let i = 0; i < confirmedOrders.length; i++) {
      colWidths.push({ wch: 15 }); // 客户数据列
    }
    
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, '餐单');
    
    // 生成Excel文件buffer
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx' 
    });
    
    console.log('Excel文件生成成功，大小:', excelBuffer.length, 'bytes');
    
    // 9. 上传到云存储
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
            ordersCount: confirmedOrders.length,
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
  const specialRequirementsRow = ['特殊备注'];

  orders.forEach(order => {
    const orderDetails = order.order_details || {};
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
    specialRequirementsRow.push(orderDetails.special_requirements);
  });
  excelData.push(breakfastRow, lunchSoupRow, lunchDish1Row, lunchDish2Row, dinnerSoupRow, dinnerDish1Row, dinnerDish2Row, supplementRow, specialRequirementsRow);

  return excelData;
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
