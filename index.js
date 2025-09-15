const core = require('@actions/core');
const tencentcloud = require("tencentcloud-sdk-nodejs");

const input = {
  secretId: core.getInput('secret_id'),
  secretKey: core.getInput('secret_key'),
  action: core.getInput('action'),
  cdnPaths: JSON.parse(core.getInput('cdn-paths')),
  eoZoneId: core.getInput('eo-zoneid'),
  eoPaths: JSON.parse(core.getInput('eo-paths')),
};

async function initialcdn() {
  core.startGroup("🔧 Initializing CDN client");

  core.info(`Action type: ${input.action}`);
  core.info(`Target cdn paths: ${JSON.stringify(input.cdnPaths)}`);
  const cdnClient = tencentcloud.cdn.v20180606.Client;
  const client = new cdnClient({
    credential: { secretId: input.secretId, secretKey: input.secretKey },
    region: "",
    profile: {
      httpProfile: { endpoint: "cdn.tencentcloudapi.com" },
    },
  });

  core.endGroup();
  return client;
}

async function initialeo() {
  core.startGroup("🔧 Initializing EdgeOne client");

  core.info(`Action type: ${input.action}`);
  core.info(`EdgeOne Zone ID: ${input.eoZoneId}`);
  core.info(`Target EdgeOne paths: ${JSON.stringify(input.eoPaths)}`);
  const eoClient = tencentcloud.teo.v20220901.Client;
  const client = new eoClient({
    credential: { secretId: input.secretId, secretKey: input.secretKey },
    region: "",
    profile: {
      httpProfile: { endpoint: "teo.tencentcloudapi.com" },
    },
  });

  core.endGroup();
  return client;
}

async function executeCdnOperation(client) {
  core.startGroup("🚀 Executing CDN operation");

  let params = {};
  let fn = null;

  if (input.action === 'purgePath') {
    core.info("Selected operation: PurgePathCache (Directory refresh)");
    fn = client.PurgePathCache.bind(client);
    params = { Paths: input.cdnPaths, FlushType: "flush" };
  } else if (input.action === 'purgeUrls') {
    core.info("Selected operation: PurgeUrlsCache (URL refresh)");
    fn = client.PurgeUrlsCache.bind(client);
    params = { Urls: input.cdnPaths };
  } else if (input.action === 'pushUrls') {
    core.info("Selected operation: PushUrlsCache (URL prefetch)");
    fn = client.PushUrlsCache.bind(client);
    params = { Urls: input.cdnPaths };
  } else {
    throw new Error(`Unknown action type: ${input.action}`);
  }

  core.info("Calling Tencent Cloud CDN API...");
  const result = await fn(params);
  core.info("CDN API call succeeded ✅");

  core.endGroup();

  core.startGroup("📦 API Response");
  core.info("Full response JSON:");
  core.info(JSON.stringify(result, null, 2));
  if (result.TaskId) core.info(`TaskId: ${result.TaskId}`);
  if (result.RequestId) core.info(`RequestId: ${result.RequestId}`);
  core.endGroup();

  core.setOutput("response", result);
}

async function executeEoOperation(client) {
  core.startGroup("🚀 Executing EdgeOne operation");

  let params = {};
  let fn = null;

  if (input.action === 'purgePath') {
    core.info("Selected operation: PurgeUrls (Directory refresh)");
    fn = client.CreatePurgeTask.bind(client);
    params = { ZoneId: input.eoZoneId, Type: "purge_prefix", Targets: input.eoPaths };
  } else if (input.action === 'purgeUrls') {
    core.info("Selected operation: PurgeUrls (URL refresh)");
    fn = client.CreatePurgeTask.bind(client);
    params = { ZoneId: input.eoZoneId, Type: "purge_url", Targets: input.eoPaths };
  } else if (input.action === 'pushUrls') {
    core.info("Selected operation: PurgeUrls (URL prefetch)");
    fn = client.CreatePrefetchTask.bind(client);
    params = { ZoneId: input.eoZoneId, Targets: input.eoPaths };
  } else {
    throw new Error(`EdgeOne does not support action type: ${input.action}, skipping EdgeOne operation.`);
  }

  core.info("Calling Tencent Cloud EdgeOne API...");
  const result = await fn(params);
  core.info("EdgeOne API call succeeded ✅");
  core.endGroup();

  core.startGroup("📦 API Response");
  core.info("Full response JSON:");
  core.info(JSON.stringify(result, null, 2));
  if (result.JobId) core.info(`JobId: ${result.JobId}`);
  if (result.FailedList) core.info(`FailedList: ${result.FailedList}`);
  if (result.RequestId) core.info(`RequestId: ${result.RequestId}`);
  core.endGroup();

  core.setOutput("response", result);
}

async function main() {
  try {
    if (input.cdnPaths) {
      const cdn = await initialcdn()
      await executeCdnOperation(cdn);
    }
    if (input.eoPaths && input.eoZoneId) {
      const eo = await initialeo()
      await executeEoOperation(eo);
    }
  } catch (error) {
    core.error("Execution failed ❌");
    core.setFailed(error.message);
  }
}

main();