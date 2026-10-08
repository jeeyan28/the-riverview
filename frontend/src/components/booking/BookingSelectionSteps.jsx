import RoomOptionCard from '../RoomOptionCard';
import { MONTHS } from './BookingPresentation';
import { dateKey, getAvailableRoomCountForDuration, getSlotState, getTimePeriod } from '../../utils/rooms';
import { slotStartMs } from '../../utils/bookingHours';
import { formatHour } from '../../utils/receipt';
export function FacilitySelectionStep({
  handleChooseOption,
  priceItems,
  room,
  selectedVariant
}) {
  return <div className="bk-step" id="bkStepPrice">
                <p className="bk-choose-label bk-choose-label--heading bk-choose-label--tight">Choose a room</p>
                <p className="bk-choose-label bk-choose-label--sub">Select the room you want to reserve.</p>
                <div className={'bk-room-list' + (selectedVariant ? ' bk-room-list--has-selection' : '')} id="bkPriceList">
                  {priceItems.map((opt, i) => {
        const isSelected = !!selectedVariant && selectedVariant.label === opt.label && selectedVariant.price === opt.price;
        return <RoomOptionCard key={i} option={opt} room={room} selected={isSelected} showSelectionIndicator={priceItems.length > 1} onSelect={() => handleChooseOption(opt)} />;
      })}
                </div>

                <p className="bk-info-bar" role="note">
                  <i className="fa-solid fa-circle-info"></i>
                  Tap a room to continue directly to its date and time availability.
                </p>
              </div>;
}
export function ScheduleStep({
  availabilityError,
  calendarDays,
  calendarLoading,
  closeHour,
  durationLabel,
  endTimeLabel,
  firstDay,
  handleChangeDate,
  handleContinueFromSchedule,
  handleSelectDate,
  handleSelectDuration,
  handleSelectHour,
  lockError,
  lockLoading,
  maxDuration,
  minDuration,
  openHour,
  reserved,
  selectedDate,
  selectedDateLabel,
  selectedDuration,
  selectedHour,
  selectedOptionLabel,
  setViewDate,
  slotsLoading,
  startTimeLabel,
  totalRooms,
  viewDate
}) {
  return <div className="bk-step" id="bkStepSchedule">
                <p className="bk-selected-option-pill">{selectedOptionLabel}</p>

                {!selectedDate && <>
                    <p className="bk-choose-label bk-choose-label--heading">When would you like to reserve?</p>
                    <div className="bk-calendar-block">
                      <div className="bk-cal-head">
                        <button className="bk-nav-btn" aria-label="Previous month" onClick={() => setViewDate(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))}>
                          <i className="fa-solid fa-chevron-left"></i>
                        </button>
                        <span className="bk-month-label">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
                        <button className="bk-nav-btn" aria-label="Next month" onClick={() => setViewDate(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))}>
                          <i className="fa-solid fa-chevron-right"></i>
                        </button>
                      </div>

                      <div className="bk-weekdays">
                        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                      </div>

                      {calendarLoading ? <div className="bk-skeleton-grid" style={{
          gridTemplateColumns: 'repeat(7, 1fr)'
        }}>
                          {Array.from({
            length: 35
          }).map((_, i) => <div key={i} className="bk-skeleton-block bk-skeleton-tile" style={{
            aspectRatio: '1',
            height: 'auto'
          }} />)}
                        </div> : <div className="bk-grid" id="bkCalGrid" key={`${viewDate.getFullYear()}-${viewDate.getMonth()}`}>
                          {Array.from({
            length: firstDay
          }).map((_, i) => <div className="bk-day bk-day--empty" key={`empty-${i}`}></div>)}
                          {calendarDays.map(day => <button type="button" key={day.d} className={'bk-day' + (day.disabled ? ' bk-day--disabled' : ' bk-day--open') + (day.isToday ? ' bk-day--today' : '') + (day.variant === 'available' ? ' bk-day--available' : '') + (day.variant === 'few' ? ' bk-day--few' : '') + (day.variant === 'full' ? ' bk-day--full' : '') + (day.variant === 'unavailable' ? ' bk-day--unavailable' : '') + (day.holiday ? ' bk-day--holiday' : '')} title={day.title || undefined} aria-label={day.title ? `${day.d}, ${day.title}` : `${day.d}`} data-tooltip={day.title || undefined} disabled={day.disabled} onClick={!day.disabled ? () => handleSelectDate(day.y, day.m, day.d) : undefined}>
                              <span className="bk-day-num">{day.d}</span>
                              {day.holiday && <span className="bk-day-holiday-badge">Holiday</span>}
                            </button>)}
                        </div>}
                    </div>

                    <div className="bk-legend">
                      <span><i className="bk-dot bk-dot--available"></i> Available</span>
                      <span><i className="bk-dot bk-dot--few"></i> Nearly full</span>
                      <span><i className="bk-dot bk-dot--full"></i> Full</span>
                      <span><i className="bk-dot bk-dot--unavailable"></i> Closed</span>
                    </div>
                  </>}

                {selectedDate && <>
                    <div className="bk-selected-date-recap">
                      <div>
                        <p className="bk-selected-date-recap-label">Selected Reservation Date</p>
                        <p className="bk-selected-date-recap-value">{selectedDateLabel}</p>
                      </div>
                      <button className="bk-change-date-btn" onClick={handleChangeDate}>
                        <i className="fa-solid fa-calendar"></i> Change date
                      </button>
                    </div>

                    <div className="bk-duration-picker">
                      <span>Duration (Maximum {maxDuration} hours)</span>
                      <div className="bk-duration-options" id="bkDurationOptions">
                        {Array.from({
            length: maxDuration - minDuration + 1
          }, (_, i) => i + minDuration).map(dur => <button type="button" key={dur} className={'bk-duration-btn' + (dur === selectedDuration ? ' bk-duration-btn--selected' : '')} aria-pressed={dur === selectedDuration} onClick={() => handleSelectDuration(dur)}>
                            {dur}h
                          </button>)}
                      </div>
                    </div>

                    <p className="bk-choose-label bk-choose-label--heading">Choose a start time</p>

                    {lockError && <p className="bk-lock-error">
                        <i className="fa-solid fa-circle-exclamation"></i> {lockError}
                      </p>}

                    {slotsLoading || availabilityError ? <div className="bk-skeleton-grid">
                        {Array.from({
          length: 6
        }).map((_, i) => <div key={i} className="bk-skeleton-block bk-skeleton-tile" />)}
                      </div> : (() => {
        const selectedKey = dateKey(selectedDate.y, selectedDate.m, selectedDate.d);
        const groups = {
          Morning: [],
          Afternoon: [],
          Evening: [],
          'After midnight · next day': []
        };
        let anyAvailable = false;
        for (let h = openHour; h < closeHour; h++) {
          if (slotStartMs(selectedKey, h) <= Date.now()) continue;
          const state = getSlotState(h, selectedDuration, closeHour, reserved, totalRooms);
          const fits = state === 'available';
          const isSelected = h === selectedHour;
          if (state === 'available') anyAvailable = true;
          let slotStatusLabel;
          let slotStatusTone = '';
          if (state === 'booked') {
            slotStatusLabel = 'Unavailable';
          } else if (state === 'insufficient') {
            slotStatusLabel = 'Ends after closing';
          } else if (isSelected) {
            slotStatusLabel = `Selected · ends ${formatHour(h + selectedDuration)}${h + selectedDuration >= 24 ? ' next day' : ''}`;
          } else {
            const availableCount = getAvailableRoomCountForDuration(reserved, totalRooms, h, selectedDuration);
            const isFewLeft = availableCount <= 2 && availableCount < totalRooms;
            slotStatusLabel = totalRooms === 1 ? 'Available' : `${availableCount} room${availableCount === 1 ? '' : 's'} available`;
            slotStatusTone = isFewLeft ? ' is-limited' : ' is-open';
          }
          groups[getTimePeriod(h)].push(<button type="button" key={h} className={'bk-slot' + (state === 'booked' ? ' bk-slot--reserved' : '') + (state === 'insufficient' ? ' bk-slot--insufficient' : '') + (isSelected ? ' bk-slot--selected' : '')} onClick={fits ? () => handleSelectHour(h) : undefined} disabled={!fits} aria-pressed={fits ? isSelected : undefined} aria-label={`${formatHour(h)}${h >= 24 ? ' next day' : ''}, ${slotStatusLabel}`}>
                              <span className="bk-slot-time">{formatHour(h)}</span>
                              <span className={`bk-slot-status${slotStatusTone}`}>{slotStatusLabel}</span>
                            </button>);
        }
        return <>
                            {!anyAvailable && <div className="bk-no-slots-msg">
                                <i className="fa-solid fa-circle-exclamation"></i>
                                No {selectedDuration}-hour slots are available on {selectedDateLabel}.{' '}
                                {selectedDuration > minDuration ? 'Try a shorter duration or ' : 'Please '}
                                <button type="button" className="bk-no-slots-change-date" onClick={handleChangeDate}>
                                  pick another date
                                </button>.
                              </div>}
                            {anyAvailable && Object.entries(groups).map(([period, slots]) => slots.length > 0 && <div className="bk-slot-group" key={period}>
                                  <span className="bk-slot-group-label">{period}</span>
                                  <div className="bk-slots-grid">{slots}</div>
                                </div>)}
                          </>;
      })()}

                    <div className="bk-time-summary" id="bkTimeSummary">
                      <div>
                        <p className="bk-summary-label">Start Time</p>
                        <p className="bk-summary-value">{startTimeLabel}</p>
                      </div>
                      <div>
                        <p className="bk-summary-label">End Time</p>
                        <p className="bk-summary-value">{endTimeLabel}</p>
                      </div>
                      <div>
                        <p className="bk-summary-label">Duration</p>
                        <p className="bk-summary-value">{durationLabel}</p>
                      </div>
                    </div>

                    <div className="bk-detail-actions">
                      <button className="bk-confirm bk-continue" disabled={selectedHour === null || lockLoading} aria-busy={lockLoading} onClick={handleContinueFromSchedule}>
                        {lockLoading ? 'Checking availability…' : 'Continue'} {!lockLoading && <i className="fa-solid fa-arrow-right"></i>}
                      </button>
                    </div>
                  </>}
              </div>;
}
export function GuestDetailsStep({
  availableDiscountAmount,
  availableDiscountPercent,
  cap,
  claimDiscount,
  confirming,
  contactError,
  continueToPayment,
  emailError,
  firstNameError,
  guestContact,
  guestCount,
  guestEmail,
  guestFirstName,
  guestLastName,
  guestNote,
  handlePaxStep,
  lastNameError,
  paxError,
  room,
  selectedAddOns,
  setClaimDiscount,
  setContactError,
  setEmailError,
  setFirstNameError,
  setGuestContact,
  setGuestCount,
  setGuestEmail,
  setGuestFirstName,
  setGuestLastName,
  setGuestNote,
  setLastNameError,
  setSelectedAddOns
}) {
  return <div className="bk-step" id="bkStepDetails">
                <p className="bk-choose-label bk-choose-label--heading">Your Information</p>

                <div className="bk-guest-fields">
                  <div className="bk-field">
                    <label className="bk-field-label" htmlFor="bkGuestLastName">Last Name</label>
                    <input type="text" id="bkGuestLastName" className={`bk-field-input${lastNameError ? ' bk-field-input--error' : ''}`} placeholder="Dela Cruz" autoComplete="family-name" required value={guestLastName} onChange={e => {
          setGuestLastName(e.target.value);
          if (lastNameError) setLastNameError('');
        }} />
                    {lastNameError && <p className="bk-field-error"><i className="fa-solid fa-circle-exclamation"></i> {lastNameError}</p>}
                  </div>
                  <div className="bk-field">
                    <label className="bk-field-label" htmlFor="bkGuestFirstName">First Name</label>
                    <input type="text" id="bkGuestFirstName" className={`bk-field-input${firstNameError ? ' bk-field-input--error' : ''}`} placeholder="Juan" autoComplete="given-name" required value={guestFirstName} onChange={e => {
          setGuestFirstName(e.target.value);
          if (firstNameError) setFirstNameError('');
        }} />
                    {firstNameError && <p className="bk-field-error"><i className="fa-solid fa-circle-exclamation"></i> {firstNameError}</p>}
                  </div>
                  <div className="bk-field">
                    <label className="bk-field-label" htmlFor="bkGuestContact">
                      Phone Number
                    </label>
                    <input type="tel" id="bkGuestContact" className={`bk-field-input${contactError ? ' bk-field-input--error' : ''}`} placeholder="0912 345 6789" autoComplete="tel" required maxLength={40} value={guestContact} onChange={e => {
          setGuestContact(e.target.value);
          if (contactError) setContactError('');
        }} />
                    {contactError && <p className="bk-field-error"><i className="fa-solid fa-circle-exclamation"></i> {contactError}</p>}
                  </div>
                  <div className="bk-field">
                    <label className="bk-field-label" htmlFor="bkGuestEmail">Email Address</label>
                    <input type="email" id="bkGuestEmail" className={`bk-field-input${emailError ? ' bk-field-input--error' : ''}`} placeholder="you@example.com" autoComplete="email" required maxLength={254} value={guestEmail} onChange={e => {
          setGuestEmail(e.target.value);
          if (emailError) setEmailError('');
        }} />
                    {emailError && <p className="bk-field-error"><i className="fa-solid fa-circle-exclamation"></i> {emailError}</p>}
                  </div>
                  <div className="bk-field">
                    <label className="bk-field-label" htmlFor="bkGuestCount">
                      Number of Guests (Pax)
                      <span className="bk-field-hint" id="bkGuestCountHint">{cap ? `Max ${cap} pax` : ''}</span>
                    </label>
                    <div className="bk-pax-stepper">
                      <button type="button" className="bk-pax-btn" aria-label="Decrease guests" onClick={() => handlePaxStep(-1)}>
                        <i className="fa-solid fa-minus"></i>
                      </button>
                      <input type="number" id="bkGuestCount" className={`bk-field-input bk-pax-input${paxError ? ' bk-field-input--error' : ''}`} min="1" max={cap || undefined} inputMode="numeric" value={guestCount} onChange={e => setGuestCount(parseInt(e.target.value, 10) || 1)} />
                      <button type="button" className="bk-pax-btn" aria-label="Increase guests" onClick={() => handlePaxStep(1)}>
                        <i className="fa-solid fa-plus"></i>
                      </button>
                    </div>
                    {paxError && <p className="bk-field-error" id="bkGuestCountError"><i className="fa-solid fa-circle-exclamation"></i> {paxError}</p>}
                  </div>
                  <div className="bk-field">
                    <label className="bk-field-label" htmlFor="bkGuestNote">
                      Special Request <span className="bk-field-optional">(Optional)</span>
                    </label>
                    <textarea id="bkGuestNote" className="bk-field-input bk-field-textarea" rows="2" placeholder="e.g. extra chairs, birthday setup, etc." value={guestNote} onChange={e => setGuestNote(e.target.value)} />
                  </div>
                  {availableDiscountPercent > 0 && <label className={`bk-addon-option bk-discount-option${claimDiscount ? ' bk-addon-option--selected' : ''}`}>
                      <input type="checkbox" checked={claimDiscount} onChange={event => setClaimDiscount(event.target.checked)} />
                      <span className="bk-addon-option-icon"><i className="fa-solid fa-tag" aria-hidden="true"></i></span>
                      <span>
                        <strong>Use {availableDiscountPercent}% room discount</strong>
                        <small>Save ₱{availableDiscountAmount.toLocaleString()} on the room. For multi-hour full payment, we deduct it online. Otherwise, staff settle it at the facility.</small>
                      </span>
                    </label>}
                  {(room.addOns || []).length > 0 && <div className="bk-optional-services">
                      <strong>Optional services</strong>
                      <p>Choose any extras you want for this reservation.</p>
                      {room.addOns.map(service => <label className={`bk-addon-option${selectedAddOns.includes(service.name) ? ' bk-addon-option--selected' : ''}`} key={service.name}>
                          <input type="checkbox" checked={selectedAddOns.includes(service.name)} onChange={event => setSelectedAddOns(current => event.target.checked ? [...current, service.name] : current.filter(name => name !== service.name))} />
                          <span className="bk-addon-option-icon"><i className="fa-solid fa-circle-plus" aria-hidden="true"></i></span>
                          <span><strong>{service.name}</strong><small>+₱{Number(service.fee).toLocaleString()} per reservation</small></span>
                        </label>)}
                    </div>}
                </div>

                <div className="bk-detail-actions">
                  <button className="bk-confirm bk-continue" disabled={confirming} onClick={continueToPayment}>
                    Continue to payment <i className="fa-solid fa-arrow-right"></i>
                  </button>
                </div>
              </div>;
}
