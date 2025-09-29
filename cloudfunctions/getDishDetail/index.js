// 获取菜品详情的云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-1gbzoqv6ad653efc'
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { dishId, dishName } = event
  
  try {
    console.log('获取菜品详情:', { dishId, dishName })
    
    let dish = null
    
    // 根据ID或名称查找菜品
    if (dishId) {
      const result = await db.collection('dishes').doc(dishId).get()
      dish = result.data
    } else if (dishName) {
      const result = await db.collection('dishes').where({
        name: dishName
      }).limit(1).get()
      
      if (result.data.length > 0) {
        dish = result.data[0]
      }
    }
    
    if (!dish) {
      return {
        success: false,
        error: 'DISH_NOT_FOUND',
        message: '菜品未找到'
      }
    }
    
    // 转换数据格式以适配前端显示
    const dishDetail = {
      id: dish._id,
      name: dish.name,
      description: dish.description || `精心制作的${dish.name}`,
      category: dish.category,
      meal_type: dish.meal_type,
      keywords: dish.keywords ? dish.keywords.split(',') : [], // 将关键词字符串转为数组
      ingredients: dish.ingredients,
      chefRecommend: dish.chefRecommend, // boolean类型
      nutritional_info: dish.nutritional_info || {},
    }
    
    return {
      success: true,
      data: dishDetail
    }
    
  } catch (error) {
    console.error('获取菜品详情失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '获取菜品详情失败: ' + error.message
    }
  }
}

