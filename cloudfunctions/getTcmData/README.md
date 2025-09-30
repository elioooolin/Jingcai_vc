# getTcmData 云函数

## 功能说明
获取用户的中医处方记录和药膳文化数据。

## 部署步骤

### 1. 安装依赖
```bash
cd cloudfunctions/getTcmData
npm install
```

### 2. 上传部署
在微信开发者工具中：
- 右键点击 `cloudfunctions/getTcmData` 文件夹
- 选择"上传并部署：云端安装依赖"

## 接口参数

### 输入参数
```javascript
{
  userId: string  // 用户ID（必填）
}
```

### 返回结果
```javascript
{
  success: boolean,
  data: {
    rxData: [
      {
        _id: string,
        userId: string,
        week: number,
        note: string,
        rx: string[],              // 药膳方ID数组
        prescriptions: [{          // 药膳方详细信息
          _id: string,
          name: string,
          ingredient: string,
          benefit: string,
          imageUrl: string
        }],
        tongueImageUrl: string,    // 舌苔图显示URL（完整的cloud://路径）
        createdAt: string
      }
    ],
    herbalCategories: [...]        // 药膳文化数据
  }
}
```

## 功能特性
- ✅ 获取用户所有处方记录，按 week 升序排序
- ✅ 自动关联 tcm 集合中的药膳方详细信息
- ✅ 返回舌苔图的完整 cloud:// URL 用于显示
- ✅ 使用统一格式路径，便于图片定位和删除
- ✅ 提供固定的药膳文化数据（茶、汤、饮、羹）

## 重要更新
- **v1.1.0**: 使用统一格式的完整 `cloud://` 路径构造 `tongueImageUrl`
  - 路径格式：`cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/${userId}/tongue/week_${week}.JPG`
  - 无需在数据库存储 fileId，通过 userId 和 week 即可定位图片
