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
      
      // 营养信息
      nutritional_info: dish.nutritional_info || {},
      
      // 为前端显示生成额外的展示数据
      icon: getIconForDish(dish.name, dish.category),
      rating: 5, // 默认评分
      tags: generateTagsFromKeywords(dish.keywords, dish.category, dish.meal_type),
      
      // 营养成分显示格式
      nutrition: formatNutritionInfo(dish.nutritional_info),
      
      // 根据chefRecommend生成推荐信息
      recommendation: dish.chefRecommend ? 
        generateRecommendationText(dish.name, dish.description, dish.ingredients) : 
        `${dish.name}是精心制作的营养菜品，适合月子期间食用。`,
      
      // 生成食用建议
      suggestions: generateSuggestions(dish.meal_type, dish.category),
      
      // 相关菜品（同类别或同餐次）
      related: [] // 暂时为空，后续可以实现推荐算法
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

// 根据菜品名称和类别生成图标
function getIconForDish(name, category) {
  if (name.includes('粥')) return '🥣'
  if (name.includes('汤')) return '🍲'
  if (name.includes('蛋')) return '🥚'
  if (name.includes('鱼')) return '🐟'
  if (name.includes('肉')) return '🥩'
  if (name.includes('菜')) return '🥬'
  if (category === '汤品') return '🍲'
  return '🍽️'
}

// 从关键词生成标签
function generateTagsFromKeywords(keywords, category, mealType) {
  const tags = []
  
  // 添加餐次标签
  const mealTypeMap = {
    'breakfast': '早餐',
    'lunch': '午餐', 
    'dinner': '晚餐'
  }
  if (mealTypeMap[mealType]) {
    tags.push(mealTypeMap[mealType])
  }
  
  // 添加类别标签
  if (category) {
    tags.push(category)
  }
  
  // 从关键词添加标签
  if (keywords) {
    const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
    tags.push(...keywordArray.slice(0, 3)) // 最多取3个关键词
  }
  
  // 添加通用标签
  tags.push('月子餐', '营养丰富')
  
  return [...new Set(tags)] // 去重
}

// 格式化营养信息
function formatNutritionInfo(nutritionalInfo) {
  if (!nutritionalInfo) return []
  
  const nutrition = []
  
  if (nutritionalInfo.calories) {
    nutrition.push({ name: '热量', value: nutritionalInfo.calories })
  }
  if (nutritionalInfo.protein) {
    nutrition.push({ name: '蛋白质', value: nutritionalInfo.protein })
  }
  if (nutritionalInfo.fat) {
    nutrition.push({ name: '脂肪', value: nutritionalInfo.fat })
  }
  if (nutritionalInfo.carbohydrates) {
    nutrition.push({ name: '碳水化合物', value: nutritionalInfo.carbohydrates })
  }
  
  return nutrition
}

// 生成推荐文字
function generateRecommendationText(name, description, ingredients) {
  return `${name}是月子期间的优质选择。${description || ''}主要食材包括${ingredients || '优质食材'}，营养丰富，有助于产后恢复。建议按需适量食用，搭配其他菜品营养更加均衡。`
}

// 生成食用建议
function generateSuggestions(mealType, category) {
  const suggestions = []
  
  // 根据餐次生成建议
  if (mealType === 'breakfast') {
    suggestions.push({ label: '适宜时间', value: '早餐时段' })
    suggestions.push({ label: '建议份量', value: '适量，易消化' })
  } else if (mealType === 'lunch') {
    suggestions.push({ label: '适宜时间', value: '午餐时段' })
    suggestions.push({ label: '建议份量', value: '正常份量' })
  } else if (mealType === 'dinner') {
    suggestions.push({ label: '适宜时间', value: '晚餐时段' })
    suggestions.push({ label: '建议份量', value: '适量，不宜过饱' })
  }
  
  // 根据类别生成建议
  if (category === '汤品') {
    suggestions.push({ label: '温度建议', value: '温热食用' })
    suggestions.push({ label: '搭配建议', value: '配合主食一起' })
  } else {
    suggestions.push({ label: '搭配建议', value: '营养均衡搭配' })
    suggestions.push({ label: '注意事项', value: '新鲜制作，及时食用' })
  }
  
  return suggestions
}
