// 번호·티켓 jsonb 형식(05#2). 생성 번호(generated_numbers.numbers)와 저장 티켓(saved_tickets.ticket_data)은 별도 타입.

/** 로또 번호: 정수 6개, 1~45, 엄격 오름차순(= 중복 없음). */
export type LottoNumbers = { nums: number[] };
/** 연금 번호: 6자리 문자열("000719"). 숫자로 바꾸지 않는다. */
export type PensionNumbers = { digits: string };
/** generated_numbers.numbers — DB `private.valid_numbers(game, numbers)`. */
export type NumbersData = LottoNumbers | PensionNumbers;

export type LottoTicket = { nums: number[] };
/** 연금 티켓: 조 1~5 + 6자리 문자열. 5조 세트는 조마다 1행. */
export type PensionTicket = { group_no: number; digits: string };
/** saved_tickets.ticket_data — DB `private.valid_ticket(game, ticket_data)`. */
export type TicketData = LottoTicket | PensionTicket;
