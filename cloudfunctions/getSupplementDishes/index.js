/**
 * 获取所有高补品数据的云函数
 * 查询 dishes 集合中 category 为 "高补品" 的所有菜品
 */

const cloud = require('wx-server-sdk');

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 云函数入口函数
 */
exports.main = async (event, context) => {
  const { store } = event;
  console.log('开始获取高补品数据...', { store });
  
  try {
    let supplementResult;

    if (store) {
      supplementResult = await db.collection('dishes')
        .where({
          category: '高补品',
          store
        })
        .get();

      if (supplementResult.data.length === 0) {
        supplementResult = await db.collection('dishes')
          .where({
            category: '高补品'
          })
          .get();
      }
    } else {
      supplementResult = await db.collection('dishes')
        .where({
          category: '高补品'
        })
        .get();
    }
    
    console.log(`找到 ${supplementResult.data.length} 个高补品`);
    
    if (supplementResult.data.length === 0) {
      return {
        success: true,
        message: '暂无高补品数据',
        dishes: []
      };
    }
    
    const dedupedDishes = dedupeByName(supplementResult.data);

    // 处理高补品数据，添加图片URL
    const supplementDishes = dedupedDishes.map(dish => {
      // 构建图片URL
      const imageFileId = `cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/dish_pics/${dish.name}.JPG`;
      
      return {
        id: dish._id,
        _id: dish._id,
        name: dish.name,
        description: dish.description || '营养丰富的高补品',
        category: dish.category,
        meal_type: dish.meal_type || 'supplement',
        ingredients: dish.ingredients,
        keywords: dish.keywords || [],
        chefRecommend: dish.chefRecommend || false,
        nutritional_info: dish.nutritional_info || {
          calories: '--',
          protein: '--',
          fat: '--',
          carbohydrates: '--'
        },
        imageUrl: imageFileId,
        imageFileId: imageFileId,
        // 高补品特有属性
        selected: false,
        icon: '🍲',
        color: '#FF6B6B'
      };
    });
    
    console.log('高补品数据处理完成');
    
    return {
      success: true,
      message: '获取高补品数据成功',
      dishes: supplementDishes,
      count: supplementDishes.length
    };
    
  } catch (error) {
    console.error('获取高补品数据失败:', error);
    return {
      success: false,
      message: '获取高补品数据失败',
      error: error.message,
      dishes: []
    };
  }
};

function dedupeByName(dishes) {
  const dishMap = new Map();

  dishes.forEach((dish) => {
    const key = String(dish.name || '').trim();
    if (!key) return;
    if (!dishMap.has(key)) {
      dishMap.set(key, dish);
    }
  });

  return Array.from(dishMap.values());
}
