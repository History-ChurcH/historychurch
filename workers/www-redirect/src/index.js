// www.historychurch.org 로 들어온 요청을 https://historychurch.org 로 보냅니다 (경로·검색어 유지, 301).
// 본 사이트(historychurch)는 코드 없는 정적 사이트라 주소별 이동을 할 수 없어서, www 만 이 작은 워커가 맡습니다.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = 'historychurch.org';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  },
};
