const fetch = require("node-fetch");

class RealDebrid {
  static rdapikeys = ["K66NBK3MNG652REA5U54U67YYRI77MZ3NVJX24NYEGQFHHYNRGLQ"];
  static rdapikey =
    this.rdapikeys[Math.floor(Math.random() * this.rdapikeys.length)];

  static headers = {
    Authorization: `Bearer ${this.rdapikey}`,
  };

  static init = () => {
    this.rdapikey =
      this.rdapikeys[Math.floor(Math.random() * this.rdapikeys.length)];
    this.headers = {
      Authorization: `Bearer ${this.rdapikey}`,
    };
  };

  static checkTorrentFileinRD = async (hash = "") => {
    if (!hash) return false;
    let url = `https://api.real-debrid.com/rest/1.0/torrents/instantAvailability/${hash}`;
    try {
      let res = await fetch(url, { method: "GET", headers: this.headers });
      if (res.statusText != "OK") return null;
      let resJson = await res.json();
      return resJson;
    } catch (error) {
      return null;
    }
  };

  static addTorrentFileinRD = async (magnet = "") => {
    if (!magnet) return false;
    let url = `https://api.real-debrid.com/rest/1.0/torrents/addMagnet`;
    let form = new URLSearchParams();
    form.append("magnet", magnet);
    try {
      let res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: form,
      });
      let resJson = await res.json();
      return resJson;
    } catch (error) {
      return false;
    }
  };

  static getTorrentInfofromRD = async (id = "") => {
    if (!id) return null;

    let url = `https://api.real-debrid.com/rest/1.0/torrents/info/${id}`;
    try {
      let res = await fetch(url, { method: "GET", headers: this.headers });
      if (res.statusText != "OK") return null;
      let resJson = await res.json();
      return resJson;
    } catch (error) {
      return null;
    }
  };

  static selectFilefromRD = async (id = "", files = "all") => {
    if (!id) return false;
    let url = `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${id}`;

    try {
      let form = new URLSearchParams();
      form.append("files", "all");
      let res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: form,
      });
      console.log(res.statusText);
      if (res.status < 400) return true;
      return false;
    } catch (error) {
      console.log({ add: error });
      return false;
    }
  };

  static deleteTorrent = async (id) => {
    if (!id) return {};
    let url = `https://api.real-debrid.com/rest/1.0/torrents/delete/${id}`;
    try {
      let res = await fetch(url, {
        method: "DELETE",
        headers: this.headers,
      });
      if (res.status < 400) return "DELETED";
      return res.statusText;
    } catch (error) {
      return false;
    }
  };

  static unrestrictLinkfromRD = async (link = "") => {
    if (!link) return {};
    let url = `https://api.real-debrid.com/rest/1.0/unrestrict/link`;
    try {
      let form = new URLSearchParams();
      form.append("link", link);
      let res = await fetch(url, {
        method: "POST",
        headers: this.headers,
        body: form,
      });
      if (res.statusText == "OK") return await res.json();
      return {};
    } catch (error) {
      return {};
    }
  };

  static removeDuplicate = (data = [], key = "name") => {
    let response = [];
    data.forEach((one, i) => {
      let index_ = response.findIndex((el) => el[key] == one[key]);
      index_ == -1 ? response.push(one) : null;
    });
    return response;
  };
}

module.exports = RealDebrid;
