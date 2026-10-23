'use strict';

(function installHuiyanModelLayers(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HuiyanModelLayers = api;
})(typeof globalThis === 'object' ? globalThis : this, function createModelLayers() {
  const providers = new Map();
  const readback = Object.freeze([
    '收到以“[SAY]”开头的内部播报指令时，只逐字说出标记后的内容，不得增加、改写或解释。',
    '绝对不要读出“[SAY]”标记，也不要在播报前后加“主动提醒、提醒结果、提醒完成、任务完成、播报完成”等流程话术。'
  ]);

  // Adapters describe protocol boundaries. Contracts, evidence, state memory,
  // freshness and audio delivery remain in the existing Huiyan application core.
  function registerProvider(id, adapter) {
    if (!id || !adapter || providers.has(id)) throw new Error('模型适配器名称无效或重复。');
    const endpoints = Object.freeze({ ...(adapter.endpoints || {}) });
    for (const endpoint of Object.values(endpoints)) {
      if (typeof endpoint !== 'string' || !endpoint.startsWith('/api/') || endpoint.startsWith('//')) {
        throw new Error('模型适配器接口必须是应用内路径。');
      }
    }
    providers.set(id, Object.freeze({ id, speech: Boolean(adapter.speech), application: Boolean(adapter.application), endpoints }));
  }

  registerProvider('google', {
    speech: true, application: true,
    endpoints: {
      cloudCheck: '/api/active-reminder-check',
      prepare: '/api/active-reminder-direct-prepare',
      finalize: '/api/active-reminder-direct-finalize'
    }
  });
  registerProvider('aliyun', {
    speech: true, application: true,
    endpoints: {
      cloudCheck: '/api/active-reminder-check',
      prepare: '/api/active-reminder-direct-prepare',
      finalize: '/api/active-reminder-direct-finalize',
      localReview: '/api/active-reminder-local-describe'
    }
  });

  function resolve(input = {}) {
    const kind = input.screeningSource || 'cloud';
    if (!['cloud', 'local'].includes(kind)) throw new Error('筛图来源无效。');
    const speechId = input.speechProvider || 'google';
    const applicationId = input.applicationProvider || (kind === 'local' ? 'aliyun' : speechId);
    const speech = providers.get(speechId);
    const application = providers.get(applicationId);
    if (!speech?.speech || !application?.application) throw new Error('所选模型没有对应层的适配器。');
    if (kind === 'local' && !application.endpoints.localReview) throw new Error('所选应用层尚未适配本地筛图复核。');
    return Object.freeze({
      version: 1,
      speech: Object.freeze({ provider: speechId }),
      application: Object.freeze({ provider: applicationId, endpoints: application.endpoints }),
      screening: Object.freeze({ source: kind, provider: kind === 'cloud' ? applicationId : 'native', model: kind === 'local' ? String(input.localModel || '') : '' })
    });
  }

  function cloudPlan(speechProvider, applicationProvider) {
    return resolve({ speechProvider, applicationProvider, screeningSource: 'cloud' });
  }
  function localPlan(speechProvider, localModel) {
    // Current proven local composition; swapping providers does not create rules.
    return resolve({ speechProvider, applicationProvider: 'aliyun', screeningSource: 'local', localModel });
  }
  function forRuntime(reminder, appVariant) {
    if (reminder?.modelLayers) return reminder.modelLayers;
    return cloudPlan(reminder?.transport === 'aliyun-realtime' ? 'aliyun' : 'google', appVariant === 'greencloud-gemini' ? 'google' : 'aliyun');
  }
  function endpoint(reminder, appVariant, name, fallback) {
    return forRuntime(reminder, appVariant).application.endpoints[name] || fallback;
  }
  return Object.freeze({ version: 1, registerProvider, resolve, cloudPlan, localPlan, forRuntime, endpoint, readbackRules: () => readback.slice() });
});
