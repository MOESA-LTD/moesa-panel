import ToastEventBus from 'primevue/toasteventbus';
import { FunctionsHttpError } from '@supabase/supabase-js';

export const appErrorHandler = async (error: any) => {
   if (error instanceof FunctionsHttpError) {
      const body = await error.context.json();
      error = _isEmpty(body) ? error.context : body;
   }

   // A database, HTTP or Auth error is shown by its name and code; any other Error (a failed
   // upload, a network failure with status 0, a throw in the app) by its message under a generic
   // summary, so a failure never passes unseen. Other values (no Error, no status or code) are not
   // errors to report.
   const classified = !!(error?.status || error?.code);
   if (!classified && !(error instanceof Error)) return;

   // Refused: the user's permissions may have changed since they were loaded.
   if (error.code === '42501' || error.status === 403)
      useAuthStore()
         .refreshAccess()
         .catch(() => {});

   console.error(error);

   const translate = (key: unknown) => {
      const path = 'errors.' + key;
      return i18n.te(path) ? i18n.t(path) : key || '';
   };

   await nextTick(async () => {
      const summary = classified ? translate(error.name || error.status) : i18n.t('errors.unknown');
      const detail = classified
         ? translate(
              error.message || error.details || error.code || error.description || error.hint
           )
         : translate(error.message);

      // The bus behind useToast(); avoids importing the app instance (circular import).
      ToastEventBus.emit('add', {
         life: 0,
         severity: ToastSeverity.WARN,
         summary,
         detail
      });
   });
};

export const errorMessages = computed(() => ({
   access_denied: i18n.t('errors.access_denied'),
   confirmation_required: i18n.t('errors.confirmation_required'),
   email_change_required: i18n.t('errors.email_change_required'),
   expired_code: i18n.t('errors.expired_code'),
   identity_provider_error: i18n.t('errors.identity_provider_error'),
   invalid_code: i18n.t('errors.invalid_code'),
   invalid_email: i18n.t('errors.invalid_email'),
   invalid_email_link: i18n.t('errors.invalid_email_link'),
   invalid_credentials: i18n.t('errors.invalid_credentials'),
   invalid_phone: i18n.t('errors.invalid_phone'),
   invalid_recovery_token: i18n.t('errors.invalid_recovery_token'),
   invalid_signup_data: i18n.t('errors.invalid_signup_data'),
   invalid_token: i18n.t('errors.invalid_token'),
   invalid_verification_link: i18n.t('errors.invalid_verification_link'),
   mfa_invalid_code: i18n.t('errors.mfa_invalid_code'),
   mfa_required: i18n.t('errors.mfa_required'),
   missing_code: i18n.t('errors.missing_code'),
   missing_email: i18n.t('errors.missing_email'),
   missing_phone: i18n.t('errors.missing_phone'),
   otp_expired: i18n.t('errors.otp_expired'),
   otp_failed: i18n.t('errors.otp_failed'),
   otp_max_attempts: i18n.t('errors.otp_max_attempts'),
   password_length: i18n.t('errors.password_length'),
   phone_change_required: i18n.t('errors.phone_change_required'),
   recovery_link_used: i18n.t('errors.recovery_link_used'),
   server_error: i18n.t('errors.server_error'),
   signup_disabled: i18n.t('errors.signup_disabled'),
   token_expired: i18n.t('errors.token_expired'),
   unauthorized_client: i18n.t('errors.unauthorized_client'),
   unexpected_error: i18n.t('errors.unexpected_error'),
   unknown_provider: i18n.t('errors.unknown_provider'),
   user_already_registered: i18n.t('errors.user_already_registered'),
   user_not_found: i18n.t('errors.user_not_found'),
   user_update_failed: i18n.t('errors.user_update_failed'),
   verification_link_used: i18n.t('errors.verification_link_used'),
   weak_password: i18n.t('errors.weak_password'),

   '02000': i18n.t('errors.no_data'),
   '02001': i18n.t('errors.no_additional_dynamic_result_sets_returned'),

   22000: i18n.t('errors.data_exception'),
   22001: i18n.t('errors.string_data_right_truncation'),
   22003: i18n.t('errors.numeric_value_out_of_range'),
   22007: i18n.t('errors.invalid_datetime_format'),
   22008: i18n.t('errors.datetime_field_overflow'),
   22012: i18n.t('errors.division_by_zero'),
   22023: i18n.t('errors.invalid_parameter_value'),
   '22P01': i18n.t('errors.floating_point_exception'),
   '22P02': i18n.t('errors.invalid_text_representation'),
   '22P03': i18n.t('errors.invalid_binary_representation'),
   '22P04': i18n.t('errors.bad_copy_file_format'),
   '22P05': i18n.t('errors.untranslatable_character'),

   23000: i18n.t('errors.integrity_constraint_violation'),
   23502: i18n.t('errors.not_null_violation'),
   23503: i18n.t('errors.foreign_key_violation'),
   23505: i18n.t('errors.unique_violation'),
   23514: i18n.t('errors.check_violation'),
   '23P01': i18n.t('errors.exclusion_violation'),

   24000: i18n.t('errors.invalid_cursor_state'),

   25000: i18n.t('errors.invalid_transaction_state'),
   '25P02': i18n.t('errors.in_failed_sql_transaction'),

   26000: i18n.t('errors.invalid_sql_statement_name'),

   28000: i18n.t('errors.invalid_authorization_specification'),
   '28P01': i18n.t('errors.invalid_password'),

   34000: i18n.t('errors.invalid_cursor_name'),

   38000: i18n.t('errors.external_routine_exception'),
   38001: i18n.t('errors.containing_sql_not_permitted'),
   38002: i18n.t('errors.modifying_sql_data_not_permitted'),
   38003: i18n.t('errors.prohibited_sql_statement_attempted'),
   38004: i18n.t('errors.reading_sql_data_not_permitted'),

   39000: i18n.t('errors.external_routine_invocation_exception'),
   39001: i18n.t('errors.invalid_sqlstate_returned'),
   39004: i18n.t('errors.null_value_not_allowed'),

   40001: i18n.t('errors.serialization_failure'),
   40003: i18n.t('errors.statement_completion_unknown'),
   '40P01': i18n.t('errors.deadlock_detected'),

   42601: i18n.t('errors.syntax_error'),
   42703: i18n.t('errors.undefined_column'),
   42804: i18n.t('errors.datatype_mismatch'),
   42830: i18n.t('errors.invalid_foreign_key'),
   42883: i18n.t('errors.undefined_function'),
   '42P01': i18n.t('errors.undefined_table'),
   '42P02': i18n.t('errors.undefined_parameter'),
   '42P18': i18n.t('errors.indeterminate_datatype'),

   44000: i18n.t('errors.with_check_option_violation'),

   42501: i18n.t('errors.insufficient_privilege'),
   42502: i18n.t('errors.insufficient_privilege_reserved'),

   '0LP01': i18n.t('errors.invalid_grant_operation'),
   '0P000': i18n.t('errors.invalid_role_specification'),

   53300: i18n.t('errors.too_many_connections'),
   53400: i18n.t('errors.configuration_limit_exceeded'),

   55000: i18n.t('errors.object_not_in_prerequisite_state'),
   55006: i18n.t('errors.object_in_use'),

   57014: i18n.t('errors.query_canceled'),
   '57P01': i18n.t('errors.admin_shutdown'),
   '57P02': i18n.t('errors.crash_shutdown'),
   '57P03': i18n.t('errors.cannot_connect_now'),

   58000: i18n.t('errors.system_error'),
   58030: i18n.t('errors.io_error'),

   F0000: i18n.t('errors.config_file_error'),

   P0001: i18n.t('errors.raise_exception'),
   P0002: i18n.t('errors.no_data_found'),
   P0003: i18n.t('errors.too_many_rows'),

   XX000: i18n.t('errors.internal_error'),
   XX001: i18n.t('errors.data_corrupted'),
   XX002: i18n.t('errors.index_corrupted'),

   HV090: i18n.t('errors.sql_med_insufficient_privilege')
}));
