# Send issues / comments of Backlog to slack by Google Apps Script (GAS)
* powered by TypeScript

## create GAS project & deploy
```sh
npm i -g @google/clasp  # install clasp command
yarn  # install dependencies
clasp login  # login to Google
clasp create backlog-to-slack --rootDir src  # create GAS Project
clasp push  # push script to Google
clasp open  # open project page in browser
```

## about secrets
Secrets like access tokens and slack webhook urls are injected via GAS's script properties.
```js
const scriptProperties = PropertiesService.getScriptProperties();
const secret = scriptProperties.getProperty("propertyName");
```
