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
    
    // 设置列宽
    worksheet['!cols'] = [
      { wch: 15 }, // 第一列（标题列）
      { wch: 30 }  // 第二列（内容列）
    ];
    
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
  
  // 为每个订单生成数据
  orders.forEach((order, index) => {
    const user = usersMap[order.userId] || {};
    const orderDetails = order.order_details || {};
    
    // 客户基本信息
    excelData.push(['客户姓名', user.name || '未知']);
    excelData.push(['房间号', user.room || '']);
    
    // 早餐信息
    const breakfast = orderDetails.breakfast || '';
    excelData.push(['早餐', breakfast]);
    
    const breakfastFamilyMeals = (orderDetails.family_meals && orderDetails.family_meals.breakfast) || 0;
    excelData.push(['早餐陪人餐数量', breakfastFamilyMeals]);
    
    // 午餐信息 - 预留3个单元格（2菜1汤）
    const lunch = orderDetails.lunch || [];
    excelData.push(['午餐菜品1', lunch[0] || '']);
    excelData.push(['午餐菜品2', lunch[1] || '']);
    excelData.push(['午餐汤品', lunch[2] || '']);
    
    const lunchFamilyMeals = (orderDetails.family_meals && orderDetails.family_meals.lunch) || 0;
    excelData.push(['午餐陪人餐数量', lunchFamilyMeals]);
    
    // 晚餐信息 - 预留3个单元格（2菜1汤）
    const dinner = orderDetails.dinner || [];
    excelData.push(['晚餐菜品1', dinner[0] || '']);
    excelData.push(['晚餐菜品2', dinner[1] || '']);
    excelData.push(['晚餐汤品', dinner[2] || '']);
    
    const dinnerFamilyMeals = (orderDetails.family_meals && orderDetails.family_meals.dinner) || 0;
    excelData.push(['晚餐陪人餐数量', dinnerFamilyMeals]);
    
    // 高补餐
    const supplement = orderDetails.supplement || '';
    if (supplement) {
      excelData.push(['高补餐', supplement]);
    }
    
    // 特殊备注
    const specialRequirements = orderDetails.special_requirements || '';
    if (specialRequirements) {
      excelData.push(['特殊备注', specialRequirements]);
    }
    
    // 如果不是最后一个订单，添加分隔行
    if (index < orders.length - 1) {
      excelData.push(['']); // 空行分隔
      excelData.push(['---', '---']); // 分隔线
      excelData.push(['']); // 空行
    }
  });
  
  return excelData;
}

/**
 * 获取门店简称
 */
function getStoreShortName(store) {
  const storeMap = {
    '爱睦·梅溪湖店': '梅溪湖店',
    '爱睦轻予·德思勤店': '德思勤店',
    '爱睦·海淀店': '海淀店',
    '爱睦·朝阳店': '朝阳店',
    '爱睦·西城店': '西城店',
    '爱睦·丰台店': '丰台店'
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
