# 总流程
```mermaid
flowchart TD
    subgraph Entrances [系统入口]
        ASR([ASR消息输入<br/>包含说话人和文本])
        Manual([用户手动提交消息])
    end

    subgraph ASRDetails [ASR系统详解]
        direction TB
        ASRFeatures[ASR核心功能：<br/>• 实时语音转文字<br/>• 声纹识别系统<br/>• 说话人身份区分<br/>• 语音内容记录]

        VoiceEnroll[声纹录入流程：<br/>1. 用户提前录入声纹<br/>2. 系统学习语音特征<br/>3. 建立个人声纹档案]

        ContentTransfer[内容转移机制：<br/>• 选择转移条数（可配置）<br/>• 批量转移ASR历史<br/>• 智能筛选关键内容]
    end

    ASR --> TriggerCheck{智能分析<br/>已开启？}
    Manual --> CreateChat[创建/获取聊天会话]
    CreateChat --> ProcessMessage[处理消息内容]

    subgraph TriggerProcess [触发机制]
        TriggerCheck -- 是 --> CheckLength[检查消息长度<br/>≥ 3字符？]
        CheckLength -- 否 --> WaitForMore[等待更多音频]
        CheckLength -- 是 --> CheckSpeaker[检查说话人<br/>累积文本]

        CheckSpeaker --> Accumulate{累积字符<br/>≥ 10？}
        Accumulate -- 否 --> WaitForMore
        Accumulate -- 是 --> MonitorSilence[启动静音检测<br/>监听2秒静音]

        MonitorSilence --> CheckTimeout{静音 ≥ 阈值？<br/>文本 ≥ 30字符？<br/>静音 ≥ 4秒？}
        CheckTimeout -- 否 --> WaitForMore
        CheckTimeout -- 是 --> RunAnalysis[[运行智能分析]]
    end

    TriggerCheck -- 否 --> SkipAnalysis[跳过智能分析<br/>直接处理消息]
    WaitForMore --> WaitForMore

    subgraph SmartAnalysis [智能分析阶段（三阶段）]
        RunAnalysis --> Phase1[阶段1：小模型判定<br/>是否需要AI介入]
        Phase1 --> Phase1Result{判定结果}

        Phase1Result -- 是 --> Phase2Check{启用意图识别？}
        Phase1Result -- 否 --> End1[结束：普通对话]

        Phase2Check -- 是 --> Phase2[阶段2：意图识别<br/>提取核心问题与大纲]
        Phase2Check -- 否 --> Phase3[阶段3：分发准备<br/>智囊团或单模型]

        Phase2 --> Phase3[阶段3：根据配置<br/>选择智囊团或单模型]
        Phase3 --> PrepareDist[准备分发配置]
    end

    subgraph Processing [消息处理模块]
        PrepareDist --> CheckMode{分发模式}
        CheckMode -- 是 --> ThinkTank[智囊团模式<br/>多模型并行回答]
        CheckMode -- 否 --> SingleModel[单模型模式<br/>当前配置模型]

        ThinkTank --> CollectResults[收集所有回答]
        SingleModel --> CollectResults

        CollectResults --> FormatOutput[格式化输出结果]
        FormatOutput --> SaveHistory[保存到聊天历史]
    end

    SkipAnalysis --> ProcessMessage
    ProcessMessage --> FormatOutput

    SaveHistory --> SendToUI[发送到前端界面]
    SendToUI --> End([分析完成])

    End1 --> SendToUI

    %% 用户配置参数
    subgraph UserConfig [⚙️ 用户可配置项]
        direction TB
        ConfigSmart[智能分析开关：on/off]
        ConfigIntent[意图识别开关：on/off]
        ConfigThinkTank[智囊团模型列表]
        ConfigThresholds[触发阈值：10字/2秒]
        ConfigProtagonist[主人公身份设置]
    end

    %% 样式定义
    style TriggerCheck fill:#e1f5fe
    style Phase1Result fill:#e1f5fe
    style CheckMode fill:#e1f5fe
    style CheckTimeout fill:#e1f5fe

    style End1 fill:#ffcdd2
    style End fill:#ffcdd2
    style WaitForMore fill:#fff9c4

    style ASR fill:#c8e6c9
    style Manual fill:#c8e6c9
    style ThinkTank fill:#fff3e0
    style SingleModel fill:#f3e5f5
    style RunAnalysis fill:#ff9999
    style Phase1 fill:#8B4513
    style Phase2 fill:#8B4513
    style Phase3 fill:#8B4513
    style TriggerProcess fill:#e8f5e8,stroke:#4caf50,stroke-width:2px

    %% ASR相关样式
    style ASRDetails fill:#e8f5e8,stroke:#4caf50,stroke-width:2px
    style ASRFeatures fill:#e8f5e8
    style VoiceEnroll fill:#f1f8e9
    style ContentTransfer fill:#e8f5e8
```

## 智能分析流程
```mermaid
flowchart TD
    Start([ASR消息输入]) --> CheckLen{长度 ≥ 3？}
    CheckLen -- 否 --> Ignore[忽略消息]
    CheckLen -- 是 --> UpdateTime[更新最后消息时间]

    UpdateTime --> ExtractSpeaker[提取说话人信息]
    ExtractSpeaker --> SameSpeaker{当前说话人<br/>已存在？}

    SameSpeaker -- 否 --> NewSpeaker[设置当前说话人<br/>重置累积文本]
    SameSpeaker -- 是 --> Accumulate[累积文本]

    Accumulate --> CheckThreshold{累积字符 ≥ 最小值（10）？}
    NewSpeaker --> CheckThreshold

    CheckThreshold -- 否 --> Wait[等待更多音频]
    CheckThreshold -- 是 --> StartSilence{已启动静音检测？}

    StartSilence -- 否 --> StartTimer[启动静音计时器]
    StartSilence -- 是 --> CheckSilence{静音 ≥ 阈值（2秒）？}

    StartTimer --> Wait
    CheckSilence -- 否 --> CheckForce{文本 ≥ 3倍阈值？}
    CheckSilence -- 是 --> Trigger[触发分析]

    CheckForce -- 是 --> Trigger
    CheckForce -- 否 --> CheckTimeout{静音 ≥ 2倍阈值？}

    CheckTimeout -- 是 --> Trigger
    CheckTimeout -- 否 --> CheckSilence

    Trigger --> RunAnalysis[[运行智能分析]]
    RunAnalysis --> CheckResult{模型判定结果}

    CheckResult -- true --> NeedsAI[需要启动智囊团]
    CheckResult -- false --> NoAI[普通对话，无需AI]

    NeedsAI --> Reset1[重置静音检测]
    NoAI --> Reset2[重置静音检测]

    Reset1 --> ResetSpeakerState[重置状态变量]
    Reset2 --> ResetSpeakerState
    ResetSpeakerState --> Ready[准备接收新消息]
    Ready --> Start

    Ignore --> Ready
    Wait --> Start

    %% 用户配置参数详细说明
    subgraph ConfigArea [⚙️ 用户可配置参数]
        direction TB
        subgraph Basic [基础参数]
            Config1["最小消息长度: 3字符<br/>过滤过短无效消息"]
            Config2["累积阈值: 10字符<br/>达到后启动静音检测"]
        end
        subgraph Timing [时间参数]
            Config3["静音阈值: 2秒<br/>首次满足触发条件"]
            Config4["强制阈值: 3倍累积<br/>30字符强制触发分析"]
            Config5["超时阈值: 4秒<br/>静音超时自动触发"]
        end
        subgraph Speaker [说话人参数]
            Config6["声纹识别<br/>区分不同说话人"]
            Config7["累积逻辑<br/>同一说话人累积，不同说话人重置"]
        end
    end

    style Trigger fill:#ff9999
    style RunAnalysis fill:#8B4513
    style NeedsAI fill:#FF6B6B
    style NoAI fill:#90EE90
    style ResetSpeakerState fill:#90EE90
    style CheckThreshold fill:#e1f5fe
    style CheckSilence fill:#e1f5fe
    style CheckForce fill:#e1f5fe
    style CheckTimeout fill:#e1f5fe
    style SameSpeaker fill:#e1f5fe
```

## 意图识别
```mermaid
flowchart TD
    Start([阶段2：意图识别启动<br/>前提：阶段1判定需要AI介入<br/>且用户开启意图识别]) --> CheckAgent{Agent可用？}

    CheckAgent -- 否 --> Fallback[使用默认意图<br/>技术讨论/决策咨询/问题解决]
    CheckAgent -- 是 --> BuildIntentPrompt[构建意图识别提示<br/>包含对话内容和主人公信息]

    BuildIntentPrompt --> CallIntentModel[调用小模型<br/>提取核心问题和讨论大纲]

    subgraph IntentDetails [意图识别详细流程]
        direction TB
        ExtractCore[1. 识别核心问题<br/>提取对话中的主要讨论话题]
        ExtractOutline[2. 生成讨论大纲<br/>列出关键要点和子话题]
        ExtractEntities[3. 提取实体信息<br/>涉及的技术、概念、决策点]
    end

    CallIntentModel --> ParseIntentJSON[解析JSON响应]

    subgraph ParseProcess [解析过程]
        direction TB
        ExtractJSON[提取JSON对象<br/>使用正则匹配]
        ValidateJSON[验证JSON格式<br/>检查必要字段]
        ReturnResult[返回结构化结果<br/>包含core_question和outline]
    end

    ParseIntentJSON --> Success{解析成功？}
    Success -- 是 --> ReturnIntent[返回意图识别结果<br/>传递给阶段3分发准备]
    Success -- 否 --> LogError[记录解析错误]

    ReturnIntent --> End([意图识别完成<br/>传递给智囊团/单模型])
    LogError --> Fallback
    Fallback --> End

    %% 配置参数
    subgraph IntentConfig [⚙️ 意图识别配置]
        direction LR
        Config1["启用开关：intent_recognition_enabled"]
        Config2["模型选择：本地/云端API"]
        Config3["上下文长度：最大50条消息"]
        Config4["输出格式：JSON (core_question + outline)"]
    end

    %% 样式定义
    style Start fill:#e1f5fe
    style CheckAgent fill:#e1f5fe
    style Success fill:#e1f5fe

    style ReturnIntent fill:#c8e6c9
    style Fallback fill:#fff3e0
    style LogError fill:#ffcdd2
    style End fill:#ffcdd2
    style CallIntentModel fill:#8B4513
    style IntentDetails fill:#f1f8e9,stroke:#4caf50,stroke-width:2px
    style ParseProcess fill:#f1f8e9,stroke:#4caf50,stroke-width:2px
```

## 智囊团
```mermaid
flowchart TD
    Start([阶段3：分发准备启动<br/>基于阶段1和阶段2结果]) --> LoadConfig[加载配置信息<br/>• API配置列表<br/>• 活跃模型列表<br/>• 角色配置]

    LoadConfig --> CheckMode{分发模式判断}

    subgraph DistributionLogic [分发逻辑]
        direction TB
        CheckThinkTank[检查智囊团模式<br/>是否配置多模型]
        LoadRoles[加载智囊团角色<br/>data/agent.json中的think_tank_roles]
        MatchRoles[根据角色标签匹配模型<br/>匹配config中的tags字段]
    end

    CheckMode -- 智囊团模式 --> DistributionLogic
    CheckMode -- 单模型模式 --> SingleModelPath[使用当前配置模型<br/>跳过角色匹配]

    DistributionLogic --> CheckMatches{找到匹配角色？}

    CheckMatches -- 是 --> ThinkTankMode[智囊团模式<br/>多模型并行处理<br/>每个角色独立分析]
    CheckMatches -- 否 --> DefaultSingleModel[回退到单模型模式<br/>使用当前激活模型]

    subgraph ThinkTankProcess [智囊团处理流程]
        direction TB
        Broadcast[广播到所有目标模型<br/>WebSocket消息：agent_triggered]
        ParallelAnalysis[并行调用多个LLM<br/>同时获取回答]
        CollectResponses[收集所有回答<br/>流式接收每个模型的输出]
        FormatResults[格式化结果<br/>为每个回答标注模型来源]
    end

    ThinkTankMode --> Broadcast
    Broadcast --> ParallelAnalysis
    ParallelAnalysis --> CollectResponses
    CollectResponses --> FormatResults

    subgraph SingleModelProcess [单模型处理流程]
        direction TB
        NotifyStart[发送开始通知<br/>"🤖 智能分析已启动"]
        CallModel[调用当前配置模型<br/>流式获取回答]
        SaveResponse[保存回答到聊天历史<br/>更新data/chat_history.json]
    end

    SingleModelPath --> SingleModelProcess
    DefaultSingleModel --> SingleModelProcess

    FormatResults --> Finalize[完成处理<br/>返回给前端UI]
    SaveResponse --> Finalize

    Finalize --> End([处理完成])

    %% 配置参数
    subgraph ThinkTankConfig [⚙️ 智囊团配置]
        direction TB
        Config1[multi_llm_active_names<br/>激活的模型名称列表]
        Config2[think_tank_roles<br/>智囊团角色配置<br/>角色ID、标签、描述]
        Config3[tags字段<br/>模型标签匹配<br/>如"技术专家"、"产品经理"等]
        Config4[当前配置<br/>current_config<br/>单模型模式使用]
    end

    %% 样式定义
    style Start fill:#e1f5fe
    style CheckMode fill:#e1f5fe
    style CheckMatches fill:#e1f5fe

    style ThinkTankMode fill:#fff3e0
    style DefaultSingleModel fill:#f3e5f5
    style SingleModelPath fill:#f3e5f5
    style End fill:#ffcdd2
    style Broadcast fill:#8B4513
    style ParallelAnalysis fill:#8B4513
    style CallModel fill:#8B4513

    style DistributionLogic fill:#f1f8e9,stroke:#4caf50,stroke-width:2px
    style ThinkTankProcess fill:#e8f5e8,stroke:#4caf50,stroke-width:2px
    style SingleModelProcess fill:#e8f5e8,stroke:#4caf50,stroke-width:2px
```