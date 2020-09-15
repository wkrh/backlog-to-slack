interface GetIssuesRes {
  id: number;
  keyId: number;
  summary: string;
  issueKey: string;
  description: string;
  updated: string;
  created: string;
  createdUser: {
    name: string;
  };
}

interface GetCommentsRes {
  id: number;
  content: string;
  createdUser: {
    name: string;
  };
  updated: string;
  created: string;
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return [
    d.getFullYear(),
    ('00' + (d.getMonth() + 1)).slice(-2),
    ('00' + d.getDate()).slice(-2),
  ].join('-');
}

const scriptProperties = PropertiesService.getScriptProperties();

class ScriptProperty {
  constructor(public name: string) {}
  getRaw() {
    return scriptProperties.getProperty(this.name);
  }

  setRaw(v: string) {
    return scriptProperties.setProperty(this.name, v);
  }
}

class StringProperty extends ScriptProperty {
  get() {
    return super.getRaw();
  }

  set(v: string) {
    return super.setRaw(v);
  }
}

class JsonProperty<T> extends ScriptProperty {
  get(): T | null {
    return JSON.parse(this.getRaw() || 'null');
  }

  set(v: T) {
    return this.setRaw(JSON.stringify(v));
  }
}

const props = {
  alreadySentIssues: new JsonProperty<string[]>('alreadySentIssues'),
  alreadySentCommentIds: new JsonProperty<number[]>('alreadySentCommentIds'),
  issueLastUpdated: new StringProperty('issueLastUpdated'),
  slackHook: new StringProperty('slackHook'),
  backlogApiKey: new StringProperty('backlogApiKey'),
  backlogProjectId: new StringProperty('backlogProjectId'),
  backlogUrl: new StringProperty('backlogUrl'),
};

const apiPaths = {
  getIssues: 'api/v2/issues',
  getComments: 'api/v2/issues/:issueIdOrKey/comments',
};

function getApiUrl(
  api: keyof typeof apiPaths,
  pathParams: { [name: string]: string } = {},
  queryParams: { [name: string]: any } = {}
) {
  queryParams['apiKey'] = props.backlogApiKey.get();
  return (
    (props.backlogUrl.get() || '') +
    '/' +
    apiPaths[api].replace(/:([a-zA-Z0-9]+)/g, (_, p1) => pathParams[p1] || p1) +
    '?' +
    Object.entries(queryParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
  );
}

function slack(data: any) {
  return UrlFetchApp.fetch(props.slackHook.get() || '', {
    payload: JSON.stringify(data),
  });
}

const formatDate = new Intl.DateTimeFormat('ja-JP-u-ca-iso8601', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
}).format;

export function main() {
  const projectId = props.backlogProjectId.get() || '';
  const alreadySentIssues = props.alreadySentIssues.get() || [];
  const alreadySentCommentIds = props.alreadySentCommentIds.get() || [];
  const issueLastUpdated = props.issueLastUpdated.get() || '';
  const backlogUrl = props.backlogUrl.get() || '';

  const issues: GetIssuesRes[] = JSON.parse(
    UrlFetchApp.fetch(
      getApiUrl(
        'getIssues',
        {},
        {
          'projectId[]': projectId,
          updatedSince: getYesterday(),
          sort: 'updated',
          count: 100,
        }
      )
    ).getContentText()
  );

  console.log(
    'issues',
    issues.map((iss) => iss.issueKey)
  );

  const newIssues = issues.filter(
    (iss) => !alreadySentIssues.includes(iss.issueKey)
  );

  newIssues.forEach((iss) => {
    if (iss.description === null) {
      return;
    }
    slack({
      text: `:open_mouth: ${iss.createdUser.name}
:page_facing_up: ${iss.summary}
:clock3: ${formatDate(new Date(iss.created))}
:globe_with_meridians: ${backlogUrl}/view/${iss.issueKey}
${iss.description}`,
    });
  });

  console.log(
    'newIssues',
    newIssues.map((iss) => iss.issueKey)
  );

  props.alreadySentIssues.set(
    alreadySentIssues.concat(newIssues.map((e) => e.issueKey))
  );

  console.log(
    'issue.updated',
    issues.map((iss) => [iss.updated, iss.updated > issueLastUpdated])
  );

  issues
    .filter((iss) => iss.updated > issueLastUpdated)
    .forEach((iss) => {
      const comments: GetCommentsRes[] = JSON.parse(
        UrlFetchApp.fetch(
          getApiUrl(
            'getComments',
            { issueIdOrKey: iss.issueKey },
            {
              count: 100,
            }
          )
        ).getContentText()
      );

      const newComments = comments.filter(
        (c) => !alreadySentCommentIds.includes(c.id)
      );

      newComments.forEach((c) => {
        slack({
          text: `:open_mouth: ${c.createdUser.name}
:clock3: ${formatDate(new Date(c.created))}
:globe_with_meridians: ${backlogUrl}/view/${iss.issueKey}#comment-${c.id}
:page_facing_up: ${iss.summary}
--
${c.content}`,
        });
      });

      props.alreadySentCommentIds.set(
        (props.alreadySentCommentIds.get() || []).concat(
          newComments.map((c) => c.id)
        )
      );
    });

  props.issueLastUpdated.set(
    issues
      .map((iss) => iss.updated)
      .reduce((max, cur) => (cur > max ? cur : max), '')
  );
}
