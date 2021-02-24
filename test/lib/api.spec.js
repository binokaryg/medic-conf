const { expect } = require('chai');
const sinon = require('sinon');
const rewire = require('rewire');

const api = rewire('../../src/lib/api');
const environment = require('../../src/lib/environment');

describe('api', () => {
  let mockRequest;
  beforeEach(() => {
    mockRequest = sinon.stub().resolves();
    api.__set__('request', mockRequest);
    sinon.stub(environment, 'apiUrl').get(() => 'http://example.com/db-name');
  });
  afterEach(sinon.restore);

  it('defaults to live requests', async () => {
    await api().version();
    expect(mockRequest.callCount).to.eq(1);
  });

  describe('formsValidate', async () => {
    it('should not fail if validate endpoint does not exist', async () => {
      mockRequest = sinon.stub().rejects({name: 'StatusCodeError', statusCode: 404});
      api.__set__('request', mockRequest);
      api.__set__('_formsValidateEndpointFound', true);
      let result = await api().formsValidate('<xml>/</xml>');
      expect(result).to.deep.eq({ok: true, formsValidateEndpointFound: false});
      expect(mockRequest.callCount).to.eq(1);
      // second call
      result = await api().formsValidate('<xml>/</xml>');
      expect(result).to.deep.eq({ok: true, formsValidateEndpointFound: false});
      expect(mockRequest.callCount).to.eq(1); // still HTTP client called only once
    });
  });

  describe('archive mode', async () => {
    beforeEach(() => sinon.stub(environment, 'isArchiveMode').get(() => true));
    
    it('does not initiate requests to api', async () => {
      await api().version();
      expect(mockRequest.callCount).to.eq(0);
    });

    it('throws not supported for undefined interfaces', () => {
      expect(api().getAppSettings).to.throw('not supported');
    });
  });
});
