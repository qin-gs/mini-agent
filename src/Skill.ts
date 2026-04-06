/**
 * 集成 Skill
 */
export interface Skill {
    name: string;
    trigger: RegExp;
    systemPromptAppend: string;
    preProcess?: (input: string) => string;
}

export class SkillSystem {

    private skills: Skill[] = [];

    register(skill: Skill) {
        this.skills.push(skill);
    }

    match(input: string): Skill | undefined {
        return this.skills.find(skill => skill.trigger.test(input));
    }

    /**
     * 预处理输入
     */
    preProcessInput(input: string, skill: Skill): string {
        if (skill.preProcess) {
            return skill.preProcess(input);
        }
        return input;
    }

    /**
     * 获取所有已注册技能名称
     */
    getSkillNames(): string[] {
        return this.skills.map(s => s.name);
    }
}

/**
 * 创建默认技能系统，包含内置技能
 */
export function createDefaultSkillSystem(): SkillSystem {
    const skillSystem = new SkillSystem();
    // 注册内置技能
    skillSystem.register({
        name: 'commit',
        trigger: /^\/commit\b/i,
        systemPromptAppend: '用户正在请求Git提交操作。请帮助用户生成合适的提交消息，并执行必要的git add和git commit命令。确保提交消息清晰、符合约定。',
        preProcess: (input) => input.replace(/^\/commit\s*/i, '').trim() || '请帮助我提交更改。'
    });
    skillSystem.register({
        name: 'review-pr',
        trigger: /^\/review-pr\b/i,
        systemPromptAppend: '用户正在请求审查Pull Request。请帮助用户分析代码变更，提供改进建议，并检查常见问题。',
        preProcess: (input) => input.replace(/^\/review-pr\s*/i, '').trim() || '请帮我审查这个PR。'
    });
    skillSystem.register({
        name: 'help',
        trigger: /^\/help\b/i,
        systemPromptAppend: '用户请求帮助。请提供关于mini agent使用方法的简明指导。',
        preProcess: (input) => input.replace(/^\/help\s*/i, '').trim() || '显示帮助信息。'
    });
    // 注册一个获取当前时间的技能
    skillSystem.register({
        name: 'time',
        trigger: /^\/time\b/i,
        systemPromptAppend: '用户正在请求获取当前时间。请获取当前时间并格式换成 yyyy-MM-dd HH:mm:ss 格式',
        preProcess: (input) => input.replace(/^\/time\s*/i, '').trim() || '请帮助我获取当前时间。'
    })
    return skillSystem;
}
