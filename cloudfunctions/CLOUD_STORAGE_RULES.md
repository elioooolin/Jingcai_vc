# 云存储路径规则

## 舌苔图存储规则

### 统一路径格式
```
${userId}/tongue/week_${week}.JPG
```

### 示例
- 用户ID: `5d47df3168dabcf100c86b035323c67f`
- 周数: `1`
- 完整路径: `5d47df3168dabcf100c86b035323c67f/tongue/week_1.JPG`

### 完整云存储URL格式
```
cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/${userId}/tongue/week_${week}.JPG
```

## 设计优势

### 1. 路径可预测
- 只需知道 `userId` 和 `week` 即可定位图片
- 无需在数据库中存储额外的 `fileId`
- 简化数据结构

### 2. 便于管理
- 按用户ID分目录存储
- 按周次命名，便于查找
- 统一的文件扩展名 `.JPG`

### 3. 操作简单
```javascript
// 上传
const cloudPath = `${userId}/tongue/week_${week}.JPG`;
await cloud.uploadFile({ cloudPath, fileContent: buffer });

// 删除
const cloudPath = `${userId}/tongue/week_${week}.JPG`;
await cloud.deleteFile({ fileList: [cloudPath] });

// 显示
const url = `cloud://cloud1-1gbzoqv6ad653efc.636c-cloud1-1gbzoqv6ad653efc-1356702265/${userId}/tongue/week_${week}.JPG`;
```

## 数据库结构

### tcm_rx 集合
```javascript
{
  _id: string,
  userId: string,     // 用户ID
  week: number,       // 周数
  note: string,       // 中医备注
  rx: string[],       // 药膳方ID数组
  createdAt: string,  // 创建日期 YYYY-MM-DD
  createdTime: Date   // 创建时间戳
  // 注意：不存储 tongueImageFileId
}
```

## 云函数操作

### addTcmRx
- 上传图片到: `${userId}/tongue/week_${week}.JPG`
- 保存记录到: `tcm_rx` 集合
- 不存储 `fileId`

### deleteTcmRx
- 构造路径: `${userId}/tongue/week_${week}.JPG`
- 删除云存储文件
- 删除数据库记录

### getTcmData
- 返回完整URL: `cloud://.../${userId}/tongue/week_${week}.JPG`
- 用于前端显示图片

## 注意事项

1. **文件命名固定**: 始终使用 `.JPG` 扩展名
2. **覆盖上传**: 同一周次重新上传会覆盖原文件
3. **防重复**: 云函数层面已防止同一周次重复提交
4. **删除策略**: 删除处方时同时删除对应图片

## 权限配置

### 云存储权限
- 云函数: 完整权限（读/写/删除）
- 用户: 仅读取权限

### 数据库权限
- 云函数: 完整权限
- 管理员: 所有权限
- 用户: 仅读取自己的数据
