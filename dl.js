class DebridLink {
  static apiKey =
  "9AKkBw_HEV1C5GgylbEIWRZGzd64wp6sb_vif5fvFsKUEF8mtykYaEz-zeSA_hpC";
  // "m0ru4828LGkNh_wvVt032mcyE3bGTDdXR7PMZNOV_yyQdhRFGa22fna9DsIknL1i";
  // "VBYyj1Bq3HXUw58SvZ3Yl_chn17UQCJx3TU0vw_bKsvMIhkRVdSw8X01VAcmI3Hd";
  // "8n3fUI9doMWlWlZKjbPfgSGkcUlgYwAHvp4raiSoBHcFBZBwAlTabqoFTZOT88Zz"
  // "XeREdNNa7p-olIbP6Kps1iIZOjsrgoecq8Un70kv0GVFSh5yzdmrIJZHvs9mrcOz"
  static BASE_URL = "https://debrid-link.com/api/v2";
  constructor() {}
  static getApiKey() {
    return this.apiKey;
  }

  static secsToDays = (seconds) => {
    return Math.floor(seconds / (60 * 60 * 24));
  };

  static headers = {
    Authorization: `Bearer ${this.apiKey}`,
    "Content-Type": "application/json",
  };

  static isSuccess = (data = {}) => {
    return data?.success == true || !("error" in data);
  };

  static getUserInfos = async () => {
    let api = this.BASE_URL + "/account/infos";

    try {
      let response = await fetch(api, {
        headers: this.headers,
      });

      console.log(`STATUS: ${response.status} - ${response.statusText}`);

      let json = await response.json();

      if (this.isSuccess(json)) {
        return "value" in json
          ? {
              username: json.value.username,
              email: json.value.email,
              accountType: json.value.accountType,
              premiumLeft: json.value.premiumLeft,
              premiumLeftInDays: this.secsToDays(json.value.premiumLeft),
              pts: json.value.pts,
              registerDate: json.value.registerDate,
            }
          : "error" in json
          ? error.json
          : JSON.stringify(json);
      }
    } catch (error) {
      console.log({ error });
    }

    return false;
  };

  static checkMagnet = async (magnet = "") => {
    let api = this.BASE_URL + "/seedbox/add";

    try {
      let response = await fetch(api, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          url: magnet,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return false;
      let json = await response.json();

      if (this.isSuccess(json)) {
        return json.value;
      }
    } catch (error) {
      console.log({ error });
    }

    return false;
  };
}

module.exports = DebridLink;
