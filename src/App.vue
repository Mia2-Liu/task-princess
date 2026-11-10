<script>
import { loadTasks } from './store/tasks'

export default {
  onLaunch() {
    loadTasks()
  }
}
</script>

<style>
page {
  background: #f6f4fb;
  color: #2b2540;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
}

view,
text,
input,
textarea,
button {
  box-sizing: border-box;
}

button::after {
  border: none;
}
</style>
