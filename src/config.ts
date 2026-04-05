/**
 * 配置管理模块
 */
export interface Config {
  /** 权限模式 */
  permission: 'auto' | 'ask' | 'strict';
  /** 模型名称 */
  model: string;
  /** 最大对话轮数 */
  maxTurns: number;
  /** 压缩阈值 */
  compactionThreshold: number;
}

/**
 * 从环境变量加载配置
 */
export function loadConfig(): Config {
  return {
    permission: (process.env.MINI_AGENT_PERMISSION ?? 'ask') as Config['permission'],
    model: process.env.MINI_AGENT_MODEL ?? 'deepseek-reasoner',
    maxTurns: parseInt(process.env.MINI_AGENT_MAX_TURNS ?? '20', 10),
    compactionThreshold: parseInt(process.env.MINI_AGENT_COMPACTION_THRESHOLD ?? '40', 10),
  };
}

/**
 * 将配置写入 JSON 文件
 */
export async function saveConfigToFile(config: Config, path: string = './config.json'): Promise<void> {
  const fs = await import('node:fs');
  fs.writeFileSync(path, JSON.stringify(config, null, 2));
}

/**
 * 从 JSON 文件加载配置
 */
export async function loadConfigFromFile(path: string = './config.json'): Promise<Config> {
  const fs = await import('node:fs');
  const content = fs.readFileSync(path, 'utf-8');
  return JSON.parse(content);
}