# 德思勤门店导入说明

本目录是根据以下源文件生成的德思勤门店导入产物：

- `/Users/elio/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_gd30wwnij8bz12_4397/msg/file/2026-03/爱睦会所点餐表（德思勤店第2版）.xlsx`

当前生成口径：

- 门店：`爱睦轻予·德思勤店`
- 已生成正餐 `dishes`
- 已生成 14 天 `daily_menus`
- 本次未生成高补品数据

## 生成结果

- [meta.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/meta.json)
- [dishes.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/dishes.json)
- [daily_menus.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/daily_menus.json)
- [import_dishes_payload.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/import_dishes_payload.json)
- [import_menus_payload.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/import_menus_payload.json)
- [clear_store_menu_payload.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/clear_store_menu_payload.json)
- [update_sysconfig_payload.template.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/update_sysconfig_payload.template.json)

## 导入前准备

1. 在微信开发者工具中确认你当前连的是正确的云开发环境。
2. 把本次改过的云函数至少重新上传部署：
   - `importMenuData`
   - `getMenuForDate`
   - `getSupplementDishes`
3. 如果德思勤以前导入过错误菜单，先执行一次 `clearMenuData`。

## 推荐导入顺序

1. 可选：清除德思勤旧菜单
2. 导入德思勤 `dishes`
3. 导入德思勤 `daily_menus`
4. 不需要改 `menu_start_date` 的话，到这里就结束

## 在微信开发者工具里怎么调云函数

方式一：云函数面板直接测试

1. 打开 `cloudfunctions/importMenuData`
2. 点击“测试”或“调用”
3. 把对应 payload 文件内容完整复制进去
4. 依次执行下面几个 payload

顺序如下：

1. [clear_store_menu_payload.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/clear_store_menu_payload.json)
2. [import_dishes_payload.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/import_dishes_payload.json)
3. [import_menus_payload.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/import_menus_payload.json)

方式二：调试器 Console 里调用

```js
wx.cloud.callFunction({
  name: 'importMenuData',
  data: /* 粘贴 payload JSON */
}).then(console.log).catch(console.error)
```

## 关于起始日

这次两店共用同一套 14 天轮换节奏，所以如果当前线上全局 `menu_start_date` 已经正确，不需要额外更新。

只有在下面两种情况才需要动它：

- 当前线上根本没有 `menu_start_date`
- 你决定给德思勤单独维护门店级起始日

如果确实要单独设置，使用：

- [update_sysconfig_payload.template.json](/Users/elio/lovemoon_vc/lovemoon_vc/data-import/desiqin/update_sysconfig_payload.template.json)

## 导入后验证

1. 德思勤客户登录后进入点餐页，能拉到菜单。
2. 同一天梅溪湖客户和德思勤客户看到的菜单不同。
3. 德思勤客户下单后，订单 `store` 仍然是 `爱睦轻予·德思勤店`。
4. 管理后台按德思勤门店筛选，能看到德思勤订单。

