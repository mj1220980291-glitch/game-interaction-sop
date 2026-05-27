# 故意违反 W6 / W2 的 fixture

跟进UI：a
需求组：b
易协作链接：c
最后更新时间：2026.05.27

## 设计总览

### 功能背景

测试 W6（簇名规则属性后缀）和 W2（死分类）软警告。

### 核心交互

parser 应返回 `ok: true`，warnings 含 `V2_W_CLUSTER_NAME_LOOKS_RULE` + `V2_W2_DEAD_CATEGORY_CLUSTER_NAME`。

## 01. 测试界面

### 展开 / 收起时机
@程序 @动效

- 故意以"时机"结尾，应触发 W6 W_CLUSTER_NAME_LOOKS_RULE

### 显示规则
@GUI

- 故意死分类"显示规则"，应触发 W2 W2_DEAD_CATEGORY_CLUSTER_NAME

### 锁定天书按钮
@GUI @程序

- 合法命名（"按钮"为界面元素名词），不应触发任何 W6/W2

#### 视觉层级
- 子分类以"层级"结尾，应触发 W6

#### 升级反馈
- 子分类含死分类后缀"反馈"——但"升级反馈"不是 dead-category 完整词，且"反馈"不在 W6 禁词后缀，应不触发任何 warning
