// cloudfunctions/getAdminCustomers/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 获取管理员客户列表
 * @param {Object} event - 云函数参数
 * @param {string} event.store - 门店筛选条件 ('all' 或具体门店值)
 * @returns {Object} 客户列表数据
 */
exports.main = async (event, context) => {
  console.log('📋 获取管理员客户列表，参数:', event);
  
  try {
    const { store } = event;
    
    // 构建查询条件
    let query = db.collection('users').where({
      userType: 'customer',
      status: 'active',
    });
    
    // 如果指定了门店，添加门店筛选
    if (store && store !== 'all') {
      query = query.where({
        store: store
      });
    }
    
    // 获取客户数据
    const customersResult = await query.get();
    console.log(`📊 查询到 ${customersResult.data.length} 个客户`);
    
    if (customersResult.data.length === 0) {
      return {
        success: true,
        customers: [],
        total: 0,
        message: '暂无客户数据'
      };
    }
    
    // 获取今天的日期
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 过滤并格式化客户数据
    const activeCustomers = [];
    
    for (const customer of customersResult.data) {

      if (customer.isMock === true || customer.status === 'inactive') continue;

      try {
        // 计算退房日期
        const checkInDate = new Date(customer.checkInDate);
        const totalDays = parseInt(customer.totalDays) || 0;
        const checkOutDate = new Date(checkInDate);
        checkOutDate.setDate(checkInDate.getDate() + totalDays);
        
        // 只显示未出住的客户（退房日期不早于今天）
        if (checkOutDate >= today) {
          // 格式化客户数据
          const formattedCustomer = {
            id: customer._id,
            name: customer.name,
            phone: formatPhone(customer.phone),
            room: customer.room,
            store: customer.store,
            checkInDate: formatDate(checkInDate),
            totalDays: `${totalDays}天`,
            checkOutDate: formatDate(checkOutDate),
            // 用于排序的原始日期
            _checkInDateRaw: checkInDate,
            _checkOutDateRaw: checkOutDate
          };
          
          activeCustomers.push(formattedCustomer);
        }
      } catch (error) {
        console.error('处理客户数据出错:', customer._id, error);
        // 跳过有问题的数据，继续处理其他客户
      }
    }
    
    // 按入住日期从早到晚排序
    activeCustomers.sort((a, b) => a._checkInDateRaw - b._checkInDateRaw);
    
    // 移除排序用的原始日期字段
    const cleanedCustomers = activeCustomers.map(customer => {
      const { _checkInDateRaw, _checkOutDateRaw, ...cleanCustomer } = customer;
      return cleanCustomer;
    });
    
    console.log(`✅ 返回 ${cleanedCustomers.length} 个在住客户`);
    
    return {
      success: true,
      customers: cleanedCustomers,
      total: cleanedCustomers.length,
      queryConditions: {
        store: store,
        filterDate: formatDate(today)
      }
    };
    
  } catch (error) {
    console.error('❌ 获取客户列表失败:', error);
    return {
      success: false,
      message: '获取客户列表失败: ' + error.message,
      customers: [],
      total: 0
    };
  }
};

/**
 * 格式化手机号码
 */
function formatPhone(phone) {
  if (!phone) return '';
  
  // 隐藏中间4位数字
  if (phone.length === 11) {
    return phone.substring(0, 3) + '****' + phone.substring(7);
  }
  
  return phone;
}

/**
 * 格式化日期
 */
function formatDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}
