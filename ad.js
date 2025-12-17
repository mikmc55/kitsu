class AllDebrid {
  constructor() {}
  static BASE_URL = "https://api.alldebrid.com/v4";
  static API_KEY = "KVl16wmzvOC9aCYxBHP5";
  static USER_AGENT = "node-all-debrid";

  static MAGNET_STATUS = {
    active: "active",
    ready: "ready",
    expired: "expired",
    error: "error",
  };

  static isSuccess = (res = {}) => {
    if (!res) return false;
    return ("status" in res && res["status"] == "success") || !("error" in res);
  };

  static headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${this.API_KEY}`,
  };

  static uploadMagnet = async (magnet = []) => {
    let api = this.BASE_URL + `/magnet/upload?agent=${this.USER_AGENT}`;

    let query = magnet.reduce((acc, cur) => {
      return acc + `&magnets[]=${cur}`;
    }, "");

    api = api + query;

    try {
      const response = await fetch(api, {
        headers: this.headers,
      });

      if (!response.ok) return false;

      const json = await response.json();

      if (this.isSuccess(json)) {
        return json["data"]["magnets"];
      }
    } catch (error) {
      console.log({ error });
    }

    return false;
  };

  static getMagnetStatus = async (id = "") => {
    let api = this.BASE_URL + `/magnet/status?agent=${this.USER_AGENT}`;

    api = api + `&id=${id}`;

    try {
      const response = await fetch(api, {
        headers: this.headers,
      });

      if (!response.ok) return false;

      const json = await response.json();

      if (this.isSuccess(json)) {
        return json["data"]["magnets"];
      }
    } catch (error) {}
  };

  static parseFilesAndLinks = (data = {}) => {
    try {
      const isFile = (e) => !!e && !!e?.l && !!e?.s;

      let files = [];

      for (const element of data) {
        if (isFile(element)) {
          files = [
            ...files,
            {
              name: element.n,
              size: element.s,
              link: element.l,
            },
          ];
        } else if ("e" in element) {
          files = [...files, ...this.parseFilesAndLinks(element.e)];
        } else {
        }
      }

      return files;
    } catch (error) {}

    return [];
  };

  static getFilesAndLinks = async (ids = []) => {
    let api = this.BASE_URL + `/magnet/files?agent=${this.USER_AGENT}`;

    let query = ids.reduce((acc, cur) => {
      return acc + `&id[]=${cur}`;
    }, "");

    api = api + query;

    try {
      const response = await fetch(api, {
        headers: this.headers,
      });

      if (!response.ok) return false;

      const json = await response.json();

      if (this.isSuccess(json)) {
        return json["data"]["magnets"];
      }
    } catch (error) {
      console.log("Error", error);
    }

    return [];
  };

  static deleteMagnet = async (id = "") => {
    let api = this.BASE_URL + `/magnet/delete?agent=${this.USER_AGENT}`;

    api = api + `&id=${id}`;

    try {
      const response = await fetch(api, {
        headers: this.headers,
      });

      return response.ok;
    } catch (error) {
      console.log("Error", error);
    }
    return false;
  };

  static unlockLink = async (url = "") => {
    let api = this.BASE_URL + `/link/unlock?agent=${this.USER_AGENT}`;

    api = api + `&link=${url}`;

    try {
      const response = await fetch(api, {
        headers: this.headers,
      });

      if (!response.ok) return false;

      const json = await response.json();
      if (this.isSuccess(json)) {
        return json["data"];
      }
    } catch (error) {
      console.log("Error", error);
    }
    return null;
  };

  static getStreamInfos = async (id = "", streamId) => {
    let api = this.BASE_URL + `link/streaming?agent=${this.USER_AGENT}`;

    api = api + `&id=${id}&stream=${streamId}`;

    try {
      const response = await fetch(api, {
        headers: this.headers,
      });

      if (!response.ok) return false;

      const json = await response.json();
      if (this.isSuccess(json)) {
        return json["data"];
      }
    } catch (error) {
      console.log("Error", error);
    }
    return null;
  };
}

module.exports = AllDebrid;
