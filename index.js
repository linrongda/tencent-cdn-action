const core = require('@actions/core');
const tencentcloud = require("tencentcloud-sdk-nodejs");

// Read raw inputs
const secretId = core.getInput('secret_id');
const secretKey = core.getInput('secret_key');
const action = core.getInput('action');
const pathsRaw = core.getInput('paths');

// Parse `paths` format into cdn paths and eo entries (zone -> paths)
// Format: multi-line text, tokens separated by whitespace. Lines starting with `zone-` are treated as EO entries.
function parsePurePaths(text) {
  const cdn = [];
  const eoMap = {}; // zoneId -> Set(paths)

  if (!text) return { cdn, eoMap };

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // split by whitespace
    const tokens = t.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    if (tokens[0].startsWith('zone-')) {
      const zoneId = tokens[0];
      const paths = tokens.slice(1);
      if (!eoMap[zoneId]) eoMap[zoneId] = new Set();
      for (const p of paths) eoMap[zoneId].add(p);
    } else {
      for (const p of tokens) cdn.push(p);
    }
  }

  // convert sets to arrays
  for (const k of Object.keys(eoMap)) {
    eoMap[k] = Array.from(eoMap[k]);
  }

  return { cdn, eoMap };
}

const parsed = parsePurePaths(pathsRaw);

// Build CDN paths (deduplicated) and EO entries from `paths` only
const cdnPaths = Array.from(new Set(parsed.cdn));
const eoEntries = Object.keys(parsed.eoMap).map(zoneId => ({ zoneId, paths: parsed.eoMap[zoneId].slice() }));

const input = {
  secretId,
  secretKey,
  action,
  cdnPaths,
  eoEntries, // array of { zoneId, paths }
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

async function executeCdnOperation(client, paths) {
  core.startGroup("🚀 Executing CDN operation");

  let params = {};
  let fn = null;

  if (input.action === 'purgePath') {
    core.info("Selected operation: PurgePathCache (Directory refresh)");
    fn = client.PurgePathCache.bind(client);
    params = { Paths: paths, FlushType: "flush" };
  } else if (input.action === 'purgeUrls') {
    core.info("Selected operation: PurgeUrlsCache (URL refresh)");
    fn = client.PurgeUrlsCache.bind(client);
    params = { Urls: paths };
  } else if (input.action === 'pushUrls') {
    core.info("Selected operation: PushUrlsCache (URL prefetch)");
    fn = client.PushUrlsCache.bind(client);
    params = { Urls: paths };
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

async function executeEoOperation(client, zoneId, paths) {
  core.startGroup("🚀 Executing EdgeOne operation");

  let params = {};
  let fn = null;

  if (input.action === 'purgePath') {
    core.info("Selected operation: PurgeUrls (Directory refresh)");
    fn = client.CreatePurgeTask.bind(client);
    params = { ZoneId: zoneId, Type: "purge_prefix", Targets: paths };
  } else if (input.action === 'purgeUrls') {
    core.info("Selected operation: PurgeUrls (URL refresh)");
    fn = client.CreatePurgeTask.bind(client);
    params = { ZoneId: zoneId, Type: "purge_url", Targets: paths };
  } else if (input.action === 'pushUrls') {
    core.info("Selected operation: PurgeUrls (URL prefetch)");
    fn = client.CreatePrefetchTask.bind(client);
    params = { ZoneId: zoneId, Targets: paths };
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
    // Validate that we have at least one target (CDN path or EO entry)
    const hasCdn = Array.isArray(input.cdnPaths) && input.cdnPaths.length > 0;
    const hasEo = Array.isArray(input.eoEntries) && input.eoEntries.length > 0;
    if (!hasCdn && !hasEo) {
      const example = `paths: |\n  https://example.com/ https://www.example.com/\n  zone-XXXX https://example.com/ https://eo.example.com/`;
      const msg = `No target paths found. Provide targets via the required \`paths\` input (breaking change). Example:\n\n${example}`;
      core.error(msg);
      core.setFailed('No target paths provided');
      throw new Error('No target paths provided');
    }

    // CDN operations (if any cdn paths were provided)
    if (hasCdn) {
      const cdn = await initialcdn();
      await executeCdnOperation(cdn, input.cdnPaths);
    }

    // EdgeOne operations: support multiple zone entries from `paths`
    if (hasEo) {
      const eoClient = await initialeo();
      for (const entry of input.eoEntries) {
        if (!entry.zoneId || !Array.isArray(entry.paths) || entry.paths.length === 0) continue;
        core.info(`Processing EdgeOne zone: ${entry.zoneId} with ${entry.paths.length} targets`);
        await executeEoOperation(eoClient, entry.zoneId, entry.paths);
      }
    }
  } catch (error) {
    core.error("Execution failed ❌");
    core.setFailed(error.message);
  }
}

main();