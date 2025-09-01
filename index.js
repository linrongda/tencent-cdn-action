const core = require('@actions/core');
const tencentcloud = require("tencentcloud-sdk-nodejs");

(async () => {
  try {
    core.startGroup("🔧 Initialization");

    const secretId = core.getInput('secret_id');
    const secretKey = core.getInput('secret_key');
    const action = core.getInput('action');
    const paths = JSON.parse(core.getInput('paths'));

    core.info(`Action type: ${action}`);
    core.info(`Target paths: ${JSON.stringify(paths)}`);

    const CdnClient = tencentcloud.cdn.v20180606.Client;
    const client = new CdnClient({
      credential: { secretId, secretKey },
      region: "",
      profile: {
        httpProfile: { endpoint: "cdn.tencentcloudapi.com" },
      },
    });

    core.endGroup();

    core.startGroup("🚀 Executing CDN operation");

    let params = {};
    let fn = null;

    if (action === 'purgePath') {
      core.info("Selected operation: PurgePathCache (Directory refresh)");
      fn = client.PurgePathCache.bind(client);
      params = { Paths: paths, FlushType: "flush" };
    } else if (action === 'purgeUrls') {
      core.info("Selected operation: PurgeUrlsCache (URL refresh)");
      fn = client.PurgeUrlsCache.bind(client);
      params = { Urls: paths };
    } else if (action === 'pushUrls') {
      core.info("Selected operation: PushUrlsCache (URL prefetch)");
      fn = client.PushUrlsCache.bind(client);
      params = { Urls: paths };
    } else {
      throw new Error(`Unknown action type: ${action}`);
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
  } catch (error) {
    core.error("Execution failed ❌");
    core.setFailed(error.message);
  }
})();
