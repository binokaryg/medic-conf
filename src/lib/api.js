const request = require('request-promise-native');

const archivingApi = require('./archiving-api');
const environment = require('./environment');
const log = require('../lib/log');

const logDeprecatedTransitions = (settings) => {
  const appSettings = JSON.parse(settings);

  if (!appSettings.transitions || !Object.keys(appSettings.transitions).length) {
    return;
  }

  const uri = `${environment.instanceUrl}/api/v1/settings/deprecated-transitions`;

  return request({ uri, method: 'GET', json: true})
    .then(transitions => {
      (transitions || []).forEach(transition => {
        const transitionSetting = appSettings.transitions[transition.name];
        const disabled = transitionSetting && transitionSetting.disable;

        if (transitionSetting && !disabled) {
          log.warn(transition.deprecationMessage);
        }
      });
    })
    .catch(error => {
      if (error.statusCode !== 404) {
        throw error;
      }
    });
};

const updateAppSettings = (settings) => {
  return request.put({
    method: 'PUT',
    url: `${environment.apiUrl}/_design/medic/_rewrite/update_settings/medic?replace=1`,
    headers: {'Content-Type': 'application/json'},
    body: settings,
  });
};

const api = {
  getAppSettings: () => {
    const url = `${environment.apiUrl}/_design/medic/_rewrite/app_settings/medic`;
    return request({ url, json: true })
      .catch(err => {
        if(err.statusCode === 404) {
          throw new Error(`Failed to fetch existing app_settings from ${url}.\n` +
              `      Check that medic-api is running and that you're connecting on the correct port!`);
        } else {
          throw err;
        }
      });
  },

  updateAppSettings: (content) => {
    return Promise.allSettled([
      updateAppSettings(content),
      logDeprecatedTransitions(content)
    ]).then(([updateSettingsResp, logTransitionResp]) => {
      if (logTransitionResp.status === 'rejected') {
        // Log error and continue with the work, this isn't a blocking task.
        log.error('Error in logging deprecated transitions:', logTransitionResp.reason);
      }
      if (updateSettingsResp.status === 'rejected') {
        throw updateSettingsResp.reason;
      }
      return updateSettingsResp.value;
    });
  },

  createUser(userData) {
    return request({
      uri: `${environment.instanceUrl}/api/v1/users`,
      method: 'POST',
      json: true,
      body: userData,
    });
  },

  getUserInfo(queryParams) {
    return request.get(`${environment.instanceUrl}/api/v1/users-info`, { qs: queryParams, json: true });
  },

  uploadSms(messages) {
    return request({
      uri: `${environment.instanceUrl}/api/sms`,
      method: 'POST',
      json: true,
      body: { messages },
    });
  },

  version() {
    return request({ uri: `${environment.instanceUrl}/api/deploy-info`, method: 'GET', json: true }) // endpoint added in 3.5
      .then(deploy_info => deploy_info && deploy_info.version);
  },

  /**
   * Whether form validation endpoint exists or not, by
   * default we assume it exists, but once `formsValidate`
   * is called if the response is a 404 error, the
   * value is changed to `false`, so next call to
   * the function the request is omitted and the
   * form considered valid
   */
  _formsValidateEndpointFound: true,

  /**
   * Validates an XForm against the API.
   * @param formXml XML string
   * @returns a JSON object if the validation is successful,
   *          typically `{ok: true}`. If the validation endpoint
   *          does not exist, the form is considered valid
   *          and `{ok: true, formsValidateEndpointFound: false}`
   *          is returned.
   *          If the method is called again after the endpoint
   *          was not found, `{ok: true, formsValidateEndpointFound: false}`
   *          will be returned again without calling the API
   * @throws `Error` exception with the validations error message
   *         from the API
   */
  formsValidate(formXml) {
    if (!this._formsValidateEndpointFound) {
      // The endpoint to validate forms doesn't exist in the API,
      // (old version), so we assume form is valid but return special result
      return Promise.resolve({ok: true, formsValidateEndpointFound: false});
    }
    return request({
      method: 'POST',
      uri: `${environment.instanceUrl}/api/v1/forms/validate`,
      headers: { 'Content-Type': 'application/xml' },
      body: formXml,
    })
    .then(resp => {
      const json = JSON.parse(resp);
      if (Object.keys(json).filter(k=>k!=='ok').length !== 0 || json.ok !== true) {
        // If other than {ok:true} is received lets log it
        log.info(`Form validation succeeded with result: ${resp}`);
      }
      return json;
    })
    .catch(err => {
      if (err.name === 'StatusCodeError' && err.statusCode === 404) {
        // The endpoint doesn't exist in the API (old version), so
        // we assume the form is valid but return special JSON
        // highlighting the situation, and storing the lack
        // of the endpoint so next call there is no need
        // to call the missed endpoint again
        this._formsValidateEndpointFound = false;
        return {ok: true, formsValidateEndpointFound: false};
      }
      if (err.statusCode === 400 && err.error) {
        throw new Error(JSON.parse(err.error).error);
      }
      throw err;
    });
  }
};

Object.keys(api).forEach(key => {
  if (!archivingApi[key]) {
    archivingApi[key] = () => { throw Error('not supported in --archive mode'); };
  }
});

module.exports = () => environment.isArchiveMode ? archivingApi : api;
