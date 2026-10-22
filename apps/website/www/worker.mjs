export default {
  fetch(request) {
    const url = new URL(request.url)
    url.protocol = 'https:'
    url.hostname = 'boromtech.com'
    return Response.redirect(url.href, 301)
  },
}
