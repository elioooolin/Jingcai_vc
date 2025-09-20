// 获取指定日期菜单的云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-1gbzoqv6ad653efc'
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { date } = event
  
  try {
    console.log('获取日期菜单:', date)
    
    // 1. 获取系统配置
    const sysConfig = await getSysConfig()
    if (!sysConfig) {
      return {
        success: false,
        error: 'SYSTEM_CONFIG_NOT_FOUND',
        message: '系统配置未找到'
      }
    }
    
    // 2. 计算菜单天数
    const menuDay = calculateMenuDay(date, sysConfig.menu_start_date)
    console.log('计算得到菜单天数:', menuDay)
    
    // 3. 获取当天菜单配置
    const dailyMenu = await getDailyMenu(menuDay)
    if (!dailyMenu) {
      return {
        success: false,
        error: 'MENU_NOT_FOUND',
        message: `第${menuDay}天菜单未找到`
      }
    }
    
    // 4. 获取菜品详情
    const menuWithDetails = await populateMenuDetails(dailyMenu)
    
    return {
      success: true,
      data: {
        date: date,
        menuDay: menuDay,
        menu: menuWithDetails
      }
    }
    
  } catch (error) {
    console.error('获取菜单失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '获取菜单失败: ' + error.message
    }
  }
}

// 获取系统配置
async function getSysConfig() {
  try {
    const result = await db.collection('sysinfo').where({
      key: 'menu_start_date'
    }).get()
    
    if (result.data.length > 0) {
      return {
        menu_start_date: result.data[0].value
      }
    }
    return null
  } catch (error) {
    console.error('获取系统配置失败:', error)
    throw error
  }
}

// 计算菜单天数
function calculateMenuDay(selectedDate, menuStartDate) {
  const startDate = new Date(menuStartDate)
  const currentDate = new Date(selectedDate)
  
  // 设置时间为当天开始，避免时间差异
  startDate.setHours(0, 0, 0, 0)
  currentDate.setHours(0, 0, 0, 0)
  
  const diffTime = currentDate.getTime() - startDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  // 计算在14天循环中的位置 (1-14)
  let menuDay = ((diffDays % 14) + 14) % 14 + 1
  
  console.log('日期计算:', {
    selectedDate,
    menuStartDate, 
    diffDays,
    menuDay
  })
  
  return menuDay
}

// 获取当天菜单配置
async function getDailyMenu(day) {
  try {
    const result = await db.collection('daily_menus').where({
      day: day
    }).get()
    
    if (result.data.length > 0) {
      return result.data[0]
    }
    return null
  } catch (error) {
    console.error('获取日菜单失败:', error)
    throw error
  }
}

// 填充菜品详情
async function populateMenuDetails(dailyMenu) {
  const menuWithDetails = {
    day: dailyMenu.day,
    meals: {}
  }
  
  try {
    console.log('开始填充菜品详情，daily_menu结构:', JSON.stringify(dailyMenu, null, 2))
    
    for (const [mealType, mealData] of Object.entries(dailyMenu.meals)) {
      console.log(`处理餐次: ${mealType}，数据:`, JSON.stringify(mealData, null, 2))
      menuWithDetails.meals[mealType] = {}
      
      for (const [categoryName, categoryData] of Object.entries(mealData)) {
        console.log(`处理类别: ${categoryName}，数据:`, JSON.stringify(categoryData, null, 2))
        
        // 获取菜品详情
        const dishDetails = []
        
        // 获取菜品ID数组（数据库中存储的是_id数组，不是菜品名称）
        const dishIds = categoryData.dishes || []
        console.log(`菜品ID列表:`, dishIds)
        
        if (!Array.isArray(dishIds)) {
          console.error(`${mealType}-${categoryName} 的 dishes 不是数组:`, dishIds)
          continue
        }
        
        for (const dishId of dishIds) {
          try {
            // 根据菜品ID查询菜品详情
            const dishResult = await db.collection('dishes').doc(dishId).get()
            
            if (dishResult.data) {
              const dish = dishResult.data
              
              // 生成图片的云存储路径 - 小程序中直接使用 fileID
              const imageFileId = `cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/dish_pics/${dish.name}.JPG`
              
              // 小程序中的 image 组件可以直接使用云存储的 fileID
              // 不需要获取临时URL，直接使用 fileID 即可
              console.log(`菜品图片路径: ${dish.name} -> ${imageFileId}`)
              
              // 为前端添加必要的显示属性
              dishDetails.push({
                ...dish,
                id: dish._id,
                selected: false,
                icon: getCategoryIcon(dish.category),
                color: getCategoryColor(dish.category, dish.meal_type),
                imageUrl: imageFileId, // 直接使用 fileID
                imageFileId: imageFileId
              })
              console.log(`成功获取菜品: ${dish.name}`)
            } else {
              console.warn(`未找到菜品ID: ${dishId}`)
            }
          } catch (error) {
            console.warn(`获取菜品详情失败，ID: ${dishId}`, error)
          }
        }
        
        menuWithDetails.meals[mealType][categoryName] = {
          selection_rule: categoryData.selection_rule,
          required_count: categoryData.required_count,
          dishes: dishDetails
        }
      }
    }
    
    console.log('菜品详情填充完成:', JSON.stringify(menuWithDetails, null, 2))
    return menuWithDetails
  } catch (error) {
    console.error('填充菜品详情失败:', error)
    throw error
  }
}

// 根据菜品类别获取图标
function getCategoryIcon(category) {
  const iconMap = {
    '菜品': '菜',
    '汤品': '汤'
  }
  return iconMap[category] || '菜'
}

// 根据菜品类别和餐次获取颜色
function getCategoryColor(category, mealType) {
  const colorMap = {
    'breakfast': {
      '菜品': '#d4a574'
    },
    'lunch': {
      '菜品': '#ea580c',
      '汤品': '#3b82f6'
    },
    'dinner': {
      '菜品': '#ea580c', 
      '汤品': '#3b82f6'
    }
  }
  
  return colorMap[mealType]?.[category] || '#d4a574'
}
