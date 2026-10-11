import { Api } from '../api/Middleware';

export type TesterState = {
  id: number;
  is_tester: boolean;
  tester_mode_enabled: boolean;
  tester_can_view_private_media: boolean;
  tester_is_invisible: boolean;
  tester_force_recommendations: boolean;
  tester_show_all_badges: boolean;
  tester_show_testers_in_daily_recommendations: boolean;
  tester_show_testers_on_top: boolean;
  gender: 'male' | 'female';
  date_of_birth: string;
  chat_credits: number;
  membership_status: number;
  membership_expiry?: string | null;
};

export type TesterNoteStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'human_required'
  | 'wont_fix';

export type TesterNoteComment = {
  id: string;
  author_type: 'tester' | 'admin' | 'ai';
  author_id?: number | null;
  author_name: string;
  body: string;
  created_at: string;
};

export type TesterNoteSummary = {
  id: number;
  screen_name: string;
  notes?: string | null;
  status: TesterNoteStatus;
  status_label: string;
  comment_count: number;
  last_comment_at?: string | null;
  has_screenshot: boolean;
  created_at: string;
  updated_at: string;
};

export type TesterNote = TesterNoteSummary & {
  comments: TesterNoteComment[];
  api_calls: Array<{
    method?: string;
    url?: string;
    status?: number;
    duration_ms?: number;
    timestamp?: string;
  }>;
  device_context: Record<string, unknown>;
  screenshot_url?: string | null;
  status_options: Array<{ value: TesterNoteStatus; label: string }>;
};

const result = <T>(response: { data?: { results?: T } }): T =>
  response.data?.results as T;

export const TesterApi = {
  async status() {
    return result<TesterState>(await Api.get('/auth/tester/status'));
  },
  async updateSelf(data: Partial<TesterState>) {
    return result<TesterState>(await Api.patch('/auth/tester/self', data));
  },
  async adjustCredits(operation: 'add' | 'remove', amount: number) {
    return result<TesterState>(
      await Api.post('/auth/tester/credits', { operation, amount })
    );
  },
  async submitNote(data: FormData) {
    return result<TesterNote>(
      await Api.post('/auth/tester/notes', data, { timeout: 60000 })
    );
  },
  async notes() {
    return result<TesterNoteSummary[]>(await Api.get('/auth/tester/notes'));
  },
  async note(noteId: number) {
    return result<TesterNote>(await Api.get(`/auth/tester/notes/${noteId}`));
  },
  async replyToNote(noteId: number, body: string) {
    return result<TesterNote>(
      await Api.post(`/auth/tester/notes/${noteId}/comments`, { body })
    );
  },
  async insights(userId: number, type: string) {
    return result<any>(
      await Api.get(`/auth/tester/users/${userId}/insights`, {
        params: { type },
      })
    );
  },
  async testers() {
    return result<any[]>(await Api.get('/auth/tester/users'));
  },
  async media(userId: number) {
    return result<any>(await Api.get(`/auth/tester/users/${userId}/media`));
  },
  async makeUserActive(userId: number) {
    return result<{ id: number; last_online_at: string }>(
      await Api.patch(`/auth/tester/users/${userId}/active`)
    );
  },
  async resetSelfData(
    type: 'daily_recommendations' | 'visits_to_me' | 'liked_by_me' | 'likes_me'
  ) {
    return result<{ type: string; cleared_count: number }>(
      await Api.post('/auth/tester/self/reset', { type })
    );
  },
  async deleteSelf() {
    return Api.delete('/auth/tester/self', {
      data: { confirmation: 'DELETE MY TEST ACCOUNT' },
    });
  },
};
