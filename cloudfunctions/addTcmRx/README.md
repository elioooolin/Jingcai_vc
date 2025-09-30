# addTcmRx 云函数

## 功能说明
添加中医处方记录，包括上传舌苔图到云存储和保存处方信息到数据库。

## 部署步骤

### 1. 安装依赖
```bash
cd cloudfunctions/addTcmRx
npm install
```

### 2. 上传部署
在微信开发者工具中：
- 右键点击 `cloudfunctions/addTcmRx` 文件夹
- 选择"上传并部署：云端安装依赖"

或使用命令行：
```bash
wx-server-sdk deploy addTcmRx
```

## 接口参数

### 输入参数
```javascript
{
  userId: string,           // 用户ID（必填）
  week: number,            // 周数（必填）
  note: string,            // 中医备注（可选）
  selectedRxIds: string[], // 选中的药膳方ID数组（可选）
  tongueImageBase64: string // 舌苔图base64编码（必填）
}
```

### 返回结果
```javascript
{
  success: boolean,        // 是否成功
  message: string,         // 提示信息
  data: {
    rxId: string          // 处方记录ID
  }
}
```

## 功能特性
- ✅ **防重复提交**：检查同一用户同一周次是否已存在处方记录
- ✅ 将 base64 图片转换为 Buffer 上传到云存储
- ✅ 使用统一格式的云存储路径：`${userId}/tongue/week_${week}.JPG`
- ✅ 保存处方记录到 `tcm_rx` 集合
- ✅ 完整的错误处理和日志记录
- ✅ 返回处方记录ID

## 错误码
- `DUPLICATE_WEEK`: 该周次处方已存在，需要先删除现有处方才能重新上传

## 云存储权限
确保云存储已配置正确的权限规则，允许云函数上传文件到指定路径。
